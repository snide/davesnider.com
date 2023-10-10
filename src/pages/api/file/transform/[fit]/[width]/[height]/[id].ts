import type { APIRoute } from 'astro';
import { xata } from '@lib/xata';
import { generateThumbnail } from '@lib/thumbnail';
import type { ImageTransformations } from '@xata.io/client';

export const GET: APIRoute = async ({ params, request }) => {
  const { id, fit, width, height } = params;

  const cookies = new Headers(request.headers).get('Cookie');
  const authCookieValue = cookies
    ?.split(';')
    .find((row) => row.trim().startsWith('auth='))
    ?.split('=')[1];

  const isAuthenticated = authCookieValue?.trim() === import.meta.env.AUTH_COOKIE_VALUE.trim();

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

    if (!isAuthenticated && fileRecord.isHidden) {
      return new Response(null, {
        status: 301,
        headers: { Location: '/auth' },
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
