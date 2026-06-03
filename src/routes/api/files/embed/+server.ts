import { filesTable } from '$db/schema';
import { db } from '$lib/server/db';
import { buildImage } from '$lib/utils/image';
import { json } from '@sveltejs/kit';
import { inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const { ids } = await request.json();

  if (!ids || !Array.isArray(ids)) {
    return json({ error: 'Invalid ids' }, { status: 400 });
  }

  const files = await db.select().from(filesTable).where(inArray(filesTable.fileId, ids)).all();

  const filesWithThumbs = await Promise.all(
    files.map(async (file) => {
      // Only process images through the image CDN, not models or videos
      if (file.fileTypeCategory === 'image') {
        const thumb = await buildImage(file.url as string, 'w=1200,h=1200,fit=scale-down');
        return {
          fileId: file.fileId,
          url: file.url,
          fileTypeCategory: file.fileTypeCategory,
          originalUploadDate: file.originalUploadDate?.toISOString() || '',
          isHidden: file.isHidden,
          isFavorite: file.isFavorite,
          thumb: {
            url: thumb.url,
            resizedUrl: thumb.resizedUrl,
            width: thumb.details?.width,
            height: thumb.details?.height
          }
        };
      } else {
        // For models and videos, just return the direct URL
        const directUrl = `https://files.davesnider.com/${file.url}`;
        return {
          fileId: file.fileId,
          url: file.url,
          fileTypeCategory: file.fileTypeCategory,
          originalUploadDate: file.originalUploadDate?.toISOString() || '',
          isHidden: file.isHidden,
          isFavorite: file.isFavorite,
          thumb: {
            url: directUrl,
            resizedUrl: directUrl
          }
        };
      }
    })
  );

  return json({ files: filesWithThumbs });
};
