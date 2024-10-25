import * as fs from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { db } from '@db/db';
import { filesTable, galleryTable, galleryToFilesTable } from '@db/schema';

const r2 = new S3Client({
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!
  },
  region: 'auto',
  forcePathStyle: true // Required for R2 compatibility
});

const folderPath = path.resolve(process.argv[2]);
const galleryName = process.argv[3];
if (!folderPath || !galleryName) {
  console.error('Please provide a folder path and a gallery name as arguments.');
  process.exit(1);
}

async function uploadFiles(folderPath: string) {
  try {
    // Create a new gallery
    // Use the provided gallery name argument
    const [newGallery] = await db.insert(galleryTable).values({ name: galleryName }).returning();

    if (!newGallery) {
      throw new Error('Failed to create a new gallery');
    }

    // Read all files from the provided folder
    const files = fs
      .readdirSync(folderPath)
      .map((fileName) => {
        const filePath = path.join(folderPath, fileName);
        return { fileName, filePath, stats: fs.lstatSync(filePath) };
      })
      .filter((file) => !file.stats.isDirectory())
      .sort((a, b) => a.stats.birthtimeMs - b.stats.birthtimeMs);

    for (const file of files) {
      const { fileName, filePath } = file;
      if (fs.lstatSync(filePath).isDirectory()) {
        continue; // Skip directories
      }

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

      // Upload to Cloudflare R2
      const fileContents = fs.readFileSync(filePath);
      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
          Key: destinationFileName,
          Body: fileContents,
          ContentType: 'application/octet-stream'
        })
      );
      console.log(`File uploaded to R2: ${destinationFileName}`);

      // Insert file record in the database
      const [newFileRecord] = await db
        .insert(filesTable)
        .values({
          fileId: randomString,
          url: destinationFileName,
          originalUploadDate: new Date(), // Change from UNIX timestamp to Date
          fileTypeCategory: fileName.split('.').pop() || 'unknown',
          isHidden: false,
          isFavorite: false
        })
        .returning();

      if (!newFileRecord) {
        console.error(`Failed to insert file record for: ${destinationFileName}`);
        continue;
      }

      // Map the file to the gallery in the galleryToFilesTable
      await db.insert(galleryToFilesTable).values({
        galleryId: newGallery.id,
        fileId: newFileRecord.id
      });
      console.log(`File mapped to gallery: ${destinationFileName}`);
    }

    console.log(`All files in ${folderPath} have been uploaded and mapped to gallery: ${galleryName}`);
  } catch (error) {
    console.error('Error occurred:', error);
  }
}

uploadFiles(folderPath);
