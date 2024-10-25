import * as chokidar from 'chokidar';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Storage } from '@google-cloud/storage';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import mime from 'mime';
import { type FilesRecord, XataClient } from '@lib/xata-codegen';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { filesTable } from '@db/schema';
import { db } from '@db/db';
import { eq } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const fileTimeouts: { [key: string]: NodeJS.Timeout } = {};
const bucketName = process.env.GOOGLE_BUCKET_ID as string;
const xata = new XataClient({ apiKey: process.env.XATA_API_KEY, branch: 'main' });
const r2 = new S3Client({
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!
  },
  region: 'auto',
  forcePathStyle: true // Required for R2 compatibility
});

// Watch for new files
const watcher = chokidar.watch(process.env.WATCH_FOLDER as string, {
  persistent: true
});

// GCP Storage for backups
const storage = new Storage({
  keyFilename: process.env.GOOGLE_KEY_FILE_LOCATION,
  projectId: process.env.GOOGLE_PROJECT_ID
});

const visionClient = new ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_KEY_FILE_LOCATION,
  projectId: process.env.GOOGLE_PROJECT_ID
});

// Add and change events are debounced to avoid processing incomplete files
watcher
  .on('add', (filePath: string) => {
    scheduleProcessing(filePath);
  })
  .on('change', (filePath: string) => {
    if (fileTimeouts[filePath]) {
      clearTimeout(fileTimeouts[filePath]);
    }
    scheduleProcessing(filePath);
  });

// Check for files every 100ms
function scheduleProcessing(filePath: string) {
  fileTimeouts[filePath] = setTimeout(() => {
    processFile(filePath);
    delete fileTimeouts[filePath];
  }, 100);
}

// Files are processed by uploading to GCS, creating a record in Xata, and sending a notification
async function processFile(filePath: string) {
  try {
    const fileName = path.basename(filePath);
    const date = new Date();
    const formattedDate = `${date.getFullYear()}${date.toLocaleString('en', { month: 'short' }).toUpperCase()}/`;
    const randomString = crypto
      .randomBytes(12)
      .toString('base64')
      .replace(/[+=/]/g, (char) => {
        switch (char) {
          case '+':
            return '-';
          case '=':
            return '_';
          case '/':
            return '~';
          default:
            return char;
        }
      });
    const destinationFileName = `${formattedDate}${randomString}.${fileName.split('.').pop()}`;

    // Determine the content type of the file
    const contentType = mime.getType(filePath) || 'application/octet-stream';

    // Upload to Google Cloud Storage
    await storage.bucket(bucketName).upload(filePath, {
      destination: destinationFileName,
      metadata: {
        contentType: contentType
      }
    });
    console.log(`File uploaded to GCS: ${destinationFileName}`);

    // Upload to Cloudflare R2
    const fileContents = fs.readFileSync(filePath);
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: destinationFileName,
        Body: fileContents,
        ContentType: contentType
      })
    );
    console.log(`File uploaded to R2: ${destinationFileName}`);

    // Upload to Xata
    const fileMetadata = {
      name: destinationFileName,
      contentType: contentType // Set the actual content type
    };

    const recordToInsert = {
      fileId: randomString,
      url: destinationFileName,
      originalUploadDate: new Date(),
      fileTypeCategory: contentType.split('/')[0] || 'unknown',
      isHidden: false,
      isFavorite: false
    };
    await db.insert(filesTable).values(recordToInsert);

    const xataRecord = await createRecordInXata(fileMetadata, filePath, randomString);
    console.log(`Record created in Xata with ID: ${xataRecord.id}`);

    // Send notification
    const fileExtension = fileName.split('.').pop() || '';
    const url = `https://snid.es/${formattedDate}${randomString}`;
    sendNotification(url, fileExtension);

    console.log('About to call Vision API for:', `gs://${bucketName}/${destinationFileName}`);

    // Call Vision API if it's an image
    if (fileMetadata.contentType?.startsWith('image/')) {
      await callVisionAPI(randomString, xataRecord, destinationFileName);
    }

    // Delete local file
    fs.unlinkSync(filePath);
    console.log(`Local file deleted: ${filePath}`);
  } catch (error) {
    console.error('ERROR:', error);
  }
}

// Process the image with the Google Vision APIs
async function callVisionAPI(id: string, xataRecord: FilesRecord, destinationFileName: string) {
  try {
    const [result] = await visionClient.annotateImage({
      image: { source: { imageUri: `gs://${bucketName}/${destinationFileName}` } },
      features: [{ type: 'LABEL_DETECTION' }, { type: 'TEXT_DETECTION' }, { type: 'IMAGE_PROPERTIES' }]
    });

    let dominantColor: string | null = null;
    let focusColor: string | null = null;
    if (
      result.imagePropertiesAnnotation &&
      result.imagePropertiesAnnotation.dominantColors &&
      result.imagePropertiesAnnotation.dominantColors.colors
    ) {
      const colors = result.imagePropertiesAnnotation.dominantColors.colors;
      // Sort the colors based on their score to find the most dominant color
      const dominantColorObject = colors.sort((a, b) => (b.pixelFraction || 0) - (a.pixelFraction || 0))[0];
      const focusColorObject = colors.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      focusColor = rgbToHex(
        focusColorObject.color?.red || 0,
        focusColorObject.color?.green || 0,
        focusColorObject.color?.blue || 0
      );
      dominantColor = rgbToHex(
        dominantColorObject.color?.red || 0,
        dominantColorObject.color?.green || 0,
        dominantColorObject.color?.blue || 0
      );
    }

    const visionData: any = {};

    if (result.labelAnnotations) {
      visionData.visionLabel = result.labelAnnotations;
    }

    if (result.textAnnotations && result.textAnnotations[0]) {
      visionData.visionText = result.textAnnotations;
      visionData.textContent = result.textAnnotations[0].description;
    }

    if (result.imagePropertiesAnnotation) {
      visionData.visionImageProperties = result.imagePropertiesAnnotation;
      if (dominantColor) {
        visionData.dominantColor = dominantColor;
      }
      if (focusColor) {
        visionData.focusColor = focusColor;
      }
    }

    // Update the Xata record with the vision data
    if (Object.keys(visionData).length > 0) {
      await xata.db.files.update(xataRecord.id, visionData);
      await db.update(filesTable).set(visionData).where(eq(filesTable.fileId, id));
      console.log(`Record updated in Xata with vision data for ID: ${xataRecord.id}`);
    }
  } catch (err: any) {
    console.error('Error from Vision API:', err);
    if (err.details) {
      console.error('Error details:', err.details);
    }
    if (!err.stack) {
      console.error('The error object does not have a stack trace.');
    }
  }
}

// Create a record in Xata
async function createRecordInXata(fileMetadata: any, filePath: string, id: string) {
  // <-- Adjusted function signature
  const fileTypeCategory = fileMetadata.contentType?.split('/')[0];
  const record = await xata.db.files.create({
    googleURL: fileMetadata.name,
    id: id,
    originalUploadDate: new Date(),
    fileTypeCategory
  });

  const fileContents = fs.readFileSync(filePath); // <-- Reading local file
  const fileBlob = new Blob([fileContents]);
  await xata.files.upload({ table: 'files', column: 'file', record: record.id }, fileBlob);
  await xata.db.files.update(record.id, { file: { mediaType: fileMetadata.contentType } });
  return record;
}

// Notifications work differently on WSL vs. Linux
function sendNotification(url: string, fileExtension: string) {
  const completeUrl = `${url}.${fileExtension}`;
  const isWSL = process.env.WSL_DISTRO_NAME !== undefined;
  const notificationCommand = isWSL
    ? `echo "${completeUrl}" | tr -d '\n' | clip.exe && wsl-notify-send.exe --category "Uploaded" "${completeUrl}" --urgency=normal`
    : `echo "${completeUrl}" | tr -d '\n' | wl-copy && notify-send "Uploaded" "${completeUrl}" --urgency=normal`;

  exec(notificationCommand, (error) => {
    if (error) {
      console.error(`Error sending notification: ${error}`);
      return;
    }
    console.log(`Notification sent: ${completeUrl}`);
  });
}

// Convert RGB to hex
function rgbToHex(r: number, g: number, b: number) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
