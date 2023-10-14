import type { APIContext, APIRoute } from 'astro';
import { xata } from '@lib/xata';

export const GET: APIRoute = async ({ params, request }: APIContext) => {
  try {
    const xataAgg = await xata.db.files.aggregate({
      byDate: {
        dateHistogram: {
          column: 'originalUploadDate',
          calendarInterval: 'month'
        }
      }
    });

    // Map the aggregation data to the desired format
    const data = xataAgg.aggs.byDate.values.map((item) => ({
      x: item['$key'],
      y: item['$count']
    }));

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
