import type { APIRoute } from 'astro';
import { xata } from '@lib/xata';
import { generateThumbnail } from '@lib/thumbnail';
import type { ImageTransformations } from '@xata.io/client';

export const GET: APIRoute = async ({ params }) => {
  const { id, fit, width, height } = params;
  if (!id) {
    return new Response(null, {
      status: 400,
      statusText: 'Bad request'
    });
  }

  try {
    const fileRecord = await xata.db.files.read(id);

    if (!fileRecord) {
      return new Response(null, {
        status: 404,
        statusText: 'Not found'
      });
    }

    if (fileRecord.fileTypeCategory !== 'image') {
      return new Response(JSON.stringify(fileRecord), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    const fileRecordWithThumb = await generateThumbnail(fileRecord, fit as ImageTransformations['fit'], width, height);

    return new Response(JSON.stringify(fileRecordWithThumb), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ message: 'Internal Server Error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
