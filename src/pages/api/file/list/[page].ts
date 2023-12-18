import type { APIContext, APIRoute } from 'astro';
import { xata } from '@lib/xata';
import { generateThumbnail } from '@lib/thumbnail';
import type { FilesRecord } from '@lib/xata-codegen';
import { safeParams } from '@lib/safe-params';
import { isAuthenticated } from '@lib/auth-check';

const stringToBool = (str: string): boolean => {
  return str.toLowerCase() === 'true';
};

export const GET: APIRoute = async ({ params, request }: APIContext) => {
  const url = new URL(request.url);
  const isHiddenParam = url.searchParams.get('isHidden') || 'false';
  const isFavoriteParam = url.searchParams.get('isFavorite') || 'true';
  const startDateParam = url.searchParams.get('startDate') || '2005-01-01';
  const endDateParam = url.searchParams.get('endDate') || new Date().toISOString().split('T')[0];
  const searchTermParam = url.searchParams.get('searchTerm') || '';
  const mediaTypeParam = url.searchParams.get('mediaType') || 'all';
  const sortOrderParam = safeParams(url.searchParams.get('sortOrder'), ['asc', 'desc', 'random'], 'desc');
  const page = params.page;
  const startDate = new Date(startDateParam + 'T00:00:00.000Z');
  const endDate = new Date(endDateParam + 'T23:59:59.999Z');

  const mediaTypeFilterMap = {
    image: 'image/*',
    video: 'video/*',
    gif: 'image/gif'
  };

  // @ts-ignore-next-line
  const isAdmin = isAuthenticated({ request });

  if (!page) {
    return new Response(null, {
      status: 400,
      statusText: 'Bad request'
    });
  }

  const pageNumber = parseInt(page) || 1;
  const pageSize = 36;

  // Need a better type for this
  let filterConditions: any = {
    isHidden: isAdmin ? stringToBool(isHiddenParam) : false,
    isFavorite: isAdmin ? stringToBool(isFavoriteParam) : true,
    originalUploadDate: { $ge: startDate, $le: endDate }
  };

  // The media type isn't available to us when searching
  if (mediaTypeParam !== 'all' && searchTermParam === '') {
    filterConditions = {
      ...filterConditions,
      'file.mediaType': { $pattern: mediaTypeFilterMap[mediaTypeParam] }
    };
  }

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
      results = fileRecords.records;

      console.log('results from search', results);
    } else {
      // @ts-ignore-next-line
      const fileRecords = await xata.db.files
        //  .filter({ googleURL: { $contains: '2018SEP' } })
        .filter({ ...filterConditions })
        .sort('originalUploadDate', sortOrderParam)
        .getPaginated({
          pagination: { size: pageSize, offset: pageSize * pageNumber - pageSize }
        });
      results = fileRecords.records;
      console.log('results from data', results.length);
    }

    const fileRecordsWithThumbs = await Promise.all(
      results.map(async (fileRecord: FilesRecord) => {
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
