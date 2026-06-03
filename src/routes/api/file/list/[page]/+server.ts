import { filesTable } from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { and, asc, between, desc, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const stringToBool = (str: string): boolean => {
  return str.toLowerCase() === 'true';
};

export const GET: RequestHandler = async ({ params, url, cookies }) => {
  const isHiddenParam = url.searchParams.get('isHidden') || 'false';
  const isFavoriteParam = url.searchParams.get('isFavorite') || 'true';
  const startDateParam = url.searchParams.get('startDate') || '2005-01-01';
  const endDateParam = url.searchParams.get('endDate') || new Date().toISOString().split('T')[0];
  const searchTermParam = url.searchParams.get('searchTerm') || '';
  const mediaTypeParam = url.searchParams.get('mediaType') || 'all';
  const sortOrderParam = url.searchParams.get('sortOrder') || 'desc';
  const page = params.page;

  const startDate = new Date(startDateParam + 'T00:00:00.000Z');
  const endDate = new Date(endDateParam + 'T23:59:59.999Z');

  const isAdmin = checkAuth(cookies);

  if (!page) {
    return json({ error: 'Bad request' }, { status: 400 });
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

    let results;

    if (searchTermParam !== '') {
      results = await db
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
    } else {
      results = await db
        .select(selectFileColumns)
        .from(filesTable)
        .where(and(...filterConditions))
        .limit(pageSize)
        .offset(pageSize * pageNumber - pageSize)
        .orderBy(sortOrder);
    }

    // Build thumbnail URLs directly without fetching metadata
    const resultsWithThumb = results.map((file) => {
      const baseUrl = `https://files.davesnider.com/${file.url}`;
      const isImage = file.fileTypeCategory === 'image';
      const thumb = isImage
        ? {
            url: baseUrl,
            resizedUrl: `https://files.davesnider.com/cdn-cgi/image/w=600,h=600,fit=scale-down/${file.url}`
          }
        : { url: baseUrl };
      return {
        ...file,
        thumb
      };
    });

    return json(resultsWithThumb);
  } catch (error) {
    console.error('Error occurred:', error);
    return json(
      { message: 'Internal Server Error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
