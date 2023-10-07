import type { APIRoute } from 'astro';
import { xata } from '@lib/xata';
import { generateThumbnail } from '@lib/thumbnail';

const stringToBool = (str: string): boolean => {
  return str.toLowerCase() === 'true';
};

export const GET: APIRoute = async ({ params, request }) => {
  const url = new URL(request.url);
  const isHiddenParam = url.searchParams.get('isHidden') || 'false';
  const isFavoriteParam = url.searchParams.get('isFavorite') || 'true';
  const page = params.page;

  console.log(url);

  const cookies = new Headers(request.headers).get('Cookie');
  const authCookieValue = cookies
    ?.split(';')
    .find((row) => row.trim().startsWith('auth='))
    ?.split('=')[1];

  const isAuthenticated = authCookieValue?.trim() === import.meta.env.AUTH_COOKIE_VALUE.trim();

  if (!page) {
    return new Response(null, {
      status: 400,
      statusText: 'Bad request'
    });
  }

  const pageNumber = parseInt(page) || 1;
  const pageSize = 36;

  let filterConditions = {
    isHidden: isAuthenticated ? stringToBool(isHiddenParam) : false,
    isFavorite: isAuthenticated ? stringToBool(isFavoriteParam) : true
  };

  console.log('isAuthenticated', isAuthenticated);
  console.log('filterConditions', filterConditions);

  try {
    const fileRecords = await xata.db.files
      //  .filter({ googleURL: { $contains: '2017MAR' } })
      //  .filter({ isHidden: false, isFavorite: true })
      .filter({ ...filterConditions })
      .sort('originalUploadDate', 'desc')
      .getPaginated({
        pagination: { size: pageSize, offset: pageSize * pageNumber - pageSize }
      });

    const fileRecordsWithThumbs = await Promise.all(
      fileRecords.records.map(async (fileRecord) => {
        return generateThumbnail(fileRecord);
      })
    );

    return new Response(JSON.stringify(fileRecordsWithThumbs), {
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
