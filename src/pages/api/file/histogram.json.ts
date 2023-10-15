import type { APIContext, APIRoute } from 'astro';
import { xata } from '@lib/xata';

export const GET: APIRoute = async ({ request }: APIContext) => {
  const url = new URL(request.url);
  const sortOrder = url.searchParams.get('sortOrder') || 'asc';
  const isHiddenParam = url.searchParams.get('isHidden') || 'false';
  const isFavoriteParam = url.searchParams.get('isFavorite') || 'true';

  console.log('sortOrder from api', sortOrder);
  try {
    const xataAgg = await xata.db.files.aggregate(
      {
        byDate: {
          dateHistogram: {
            column: 'originalUploadDate',
            calendarInterval: 'month'
          }
        }
      },
      {
        isHidden: isHiddenParam === 'true',
        isFavorite: isFavoriteParam === 'true'
      }
    );

    // Map the aggregation data to the desired format
    let data = xataAgg.aggs.byDate.values.map((item) => ({
      x: item['$key'],
      y: item['$count']
    }));

    if (sortOrder === 'desc') {
      data = data.reverse();
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error occurred:', error);
    return new Response(JSON.stringify({ message: error }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
