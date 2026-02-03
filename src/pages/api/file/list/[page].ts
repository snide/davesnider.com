import type { APIContext, APIRoute } from 'astro';
import { safeParams } from '@lib/safe-params';
import { isAuthenticated } from '@lib/auth-check';
import { db } from '@db/db';
import { filesTable, type SelectFile } from '@db/schema';
import { and, eq, sql, between, asc, desc } from 'drizzle-orm';

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

  const filterConditions = [
    eq(filesTable.isHidden, isAdmin ? stringToBool(isHiddenParam) : false),
    eq(filesTable.isFavorite, isAdmin ? stringToBool(isFavoriteParam) : true),
    between(filesTable.originalUploadDate, startDate, endDate)
  ];

  if (mediaTypeParam !== 'all' && searchTermParam === '') {
    filterConditions.push(eq(filesTable.fileTypeCategory, mediaTypeParam));
  }

  let results;

  try {
    const sortOrder =
      sortOrderParam === 'asc' ? asc(filesTable.originalUploadDate) : desc(filesTable.originalUploadDate);
    const selectFileColumns = {
      id: filesTable.id,
      fileId: filesTable.fileId,
      url: filesTable.url,
      fileTypeCategory: filesTable.fileTypeCategory,
      originalUploadDate: filesTable.originalUploadDate,
      isFavorite: filesTable.isFavorite,
      isHidden: filesTable.isHidden
    };

    if (searchTermParam !== '') {
      const fileRecords = await db
        .select(selectFileColumns)
        .from(filesTable)
        .where(
          and(
            sql`${filesTable.id} IN (SELECT rowid FROM files_fts WHERE files_fts MATCH ${searchTermParam})`,
            ...filterConditions
          )
        )
        .limit(pageSize)
        .offset(pageSize * pageNumber - pageSize)
        .orderBy(sortOrder);
      results = fileRecords;
    } else {
      const fileRecords = await db
        .select(selectFileColumns)
        .from(filesTable)
        .where(and(...filterConditions))
        .limit(pageSize)
        .offset(pageSize * pageNumber - pageSize)
        .orderBy(sortOrder);
      results = fileRecords;
    }

    // Build thumbnail URLs directly without fetching metadata (avoids rate limiting)
    const resultsWithThumb = results.map((file: SelectFile) => {
      const baseUrl = `https://files.davesnider.com/${file.url}`;
      const isImage = file.fileTypeCategory === 'image';
      const thumb = isImage
        ? { url: baseUrl, resizedUrl: `https://files.davesnider.com/cdn-cgi/image/w=600,h=600,fit=scale-down/${file.url}` }
        : { url: baseUrl };
      return {
        ...file,
        thumb
      };
    });

    return new Response(JSON.stringify(resultsWithThumb), {
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
