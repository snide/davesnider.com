import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const r2 = new S3Client({
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!
  },
  region: 'auto',
  forcePathStyle: true
});

export async function uploadPosterToR2(posterUrl: string, subfolder = 'plex'): Promise<string | null> {
  try {
    const response = await fetch(posterUrl, {
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      console.error(`[R2] Failed to fetch poster: ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
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
    const destinationFileName = `activity/${subfolder}/${formattedDate}${randomString}.jpg`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: destinationFileName,
        Body: Buffer.from(buffer),
        ContentType: 'image/jpeg'
      })
    );

    return `https://files.davesnider.com/${destinationFileName}`;
  } catch (err) {
    console.error('[R2] Failed to upload poster:', err);
    return null;
  }
}

export async function uploadImageToR2WithHash(imageUrl: string, subfolder: string = 'plex'): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      console.error(`[R2] Failed to fetch image: ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = await response.arrayBuffer();

    // Compute SHA-256 hash of image content (first 32 hex chars)
    const hash = crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex').slice(0, 32);

    // Detect content type and extension
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';

    const destinationFileName = `activity/${subfolder}/${hash}.${ext}`;

    // Check if file already exists via HEAD request
    try {
      await r2.send(
        new HeadObjectCommand({
          Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
          Key: destinationFileName
        })
      );
      // File exists, return existing URL
      return `https://files.davesnider.com/${destinationFileName}`;
    } catch {
      // File doesn't exist, proceed with upload
    }

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: destinationFileName,
        Body: Buffer.from(buffer),
        ContentType: contentType
      })
    );

    return `https://files.davesnider.com/${destinationFileName}`;
  } catch (err) {
    console.error('[R2] Failed to upload image with hash:', err);
    return null;
  }
}
