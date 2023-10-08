import type { APIRoute } from 'astro';
import { xata } from '@lib/xata';
import { generateThumbnail } from '@lib/thumbnail';
import type { FilesRecord } from '@lib/xata-codegen';

const stringToBool = (str: string): boolean => {
  return str.toLowerCase() === 'true';
};

export const GET: APIRoute = async ({ params, request }) => {
  const url = new URL(request.url);
  const isHiddenParam = url.searchParams.get('isHidden') || 'false';
  const isFavoriteParam = url.searchParams.get('isFavorite') || 'true';
  const startDateParam = url.searchParams.get('startDate') || '2010-01-01';
  const endDateParam = url.searchParams.get('endData') || new Date().toISOString().split('T')[0];
  const searchTermParam = url.searchParams.get('searchTerm') || '';
  const page = params.page;

  const startDate = new Date(startDateParam);
  const endDate = new Date(endDateParam);
  console.log('startDate', startDate);
  console.log('endDate', endDate);

  //  console.log(url);

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
    isFavorite: isAuthenticated ? stringToBool(isFavoriteParam) : true,
    originalUploadDate: { $ge: startDate, $le: endDate }
  };

  console.log('isAuthenticated', isAuthenticated);
  console.log('filterConditions', filterConditions);

  let results;

  try {
    if (searchTermParam !== '') {
      const fileRecords = await xata.db.files.search(searchTermParam, {
        target: ['textContent', 'visionLabel'],
        filter: { ...filterConditions },
        fuzziness: 1,
        page: {
          size: pageSize,
          offset: pageSize * pageNumber - pageSize
        }
      });
      results = fileRecords;
      console.log('results from search', results.length);
    } else {
      const fileRecords = await xata.db.files
        //  .filter({ googleURL: { $contains: '2017MAR' } })
        //  .filter({ isHidden: false, isFavorite: true })
        .filter({ ...filterConditions })
        .sort('originalUploadDate', 'desc')
        .getPaginated({
          pagination: { size: pageSize, offset: pageSize * pageNumber - pageSize }
        });
      results = fileRecords.records;
      console.log('results from data', results.length);
    }

    const fileRecordsWithThumbs = await Promise.all(
      results.map(async (fileRecord) => {
        //  console.log('fileRecord', fileRecord.id);
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
    console.error('Error occurred:', error); // Log the error for debugging purposes

    return new Response(
      JSON.stringify({
        message: 'Internal Server Error',
        error: error.message
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
};
