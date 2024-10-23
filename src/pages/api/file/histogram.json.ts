import type { APIContext, APIRoute } from 'astro';
import { db } from '@db/db';
import { filesTable } from '@db/schema';
import { and, eq, sql, desc, asc, isNotNull } from 'drizzle-orm';

export const GET: APIRoute = async ({ request }: APIContext) => {
  const url = new URL(request.url);
  const sortOrder = url.searchParams.get('sortOrder') || 'asc';
  const isHiddenParam = url.searchParams.get('isHidden') || 'false';
  const isFavoriteParam = url.searchParams.get('isFavorite') || 'true';
  const mediaTypeParam = url.searchParams.get('mediaType') || 'all';

  // Build filter conditions dynamically
  let filterConditions = [
    eq(filesTable.isHidden, isHiddenParam === 'true'),
    eq(filesTable.isFavorite, isFavoriteParam === 'true'),
    isNotNull(filesTable.originalUploadDate) // Ensure the date is not null
  ];

  if (mediaTypeParam !== 'all') {
    filterConditions.push(eq(filesTable.fileTypeCategory, mediaTypeParam === 'image' ? 'image' : 'video'));
  }

  try {
    // Grouping by year and month using strftime
    const groupedResults = await db
      .select({
        month: sql`strftime('%Y-%m', datetime(${filesTable.originalUploadDate}, 'unixepoch'))`.as('month'),
        count: sql`COUNT(*)`.as('count')
      })
      .from(filesTable)
      .where(and(...filterConditions))
      .groupBy(sql`strftime('%Y-%m', datetime(${filesTable.originalUploadDate}, 'unixepoch'))`)
      .orderBy(
        sortOrder === 'desc'
          ? desc(sql`strftime('%Y-%m', datetime(${filesTable.originalUploadDate}, 'unixepoch'))`)
          : asc(sql`strftime('%Y-%m', datetime(${filesTable.originalUploadDate}, 'unixepoch'))`)
      )
      .run();

    // Access the rows from the result
    let data = groupedResults.rows.map((item) => ({
      x: item.month,
      y: item.count ?? 0 // Default to 0 if count is null or undefined
    }));

    // Remove any objects that have 0 for the y value
    data = data.filter((item) => typeof item.y === 'number' && item.y > 0);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error occurred:', error);
    return new Response(JSON.stringify({ message: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
