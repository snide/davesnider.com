import type { APIContext, APIRoute } from 'astro';
import { xata } from '@lib/xata';
import { isAuthenticated } from '@lib/auth-check';

export const GET: APIRoute = async ({ request }: APIContext) => {
  const url = new URL(request.url);
  const searchTermParam = url.searchParams.get('searchTerm') || '';

  // @ts-ignore-next-line
  const isAdmin = isAuthenticated({ request });
  try {
    if (searchTermParam) {
      const results = await xata.db.links.search(searchTermParam, {
        fuzziness: 1,
        filter: { isPrivate: false },
        target: [{ column: 'title' }, { column: 'url' }, { column: 'comment' }, { column: 'tags', weight: 2 }]
      });
      return new Response(JSON.stringify(results.records), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } else {
      const results = await xata.db.links.filter({ isPrivate: false }).sort('xata.createdAt', 'desc').getAll();
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
  } catch (error) {
    return new Response(null, {
      status: error.statusCode || 500,
      statusText: error.message || 'Internal server error'
    });
  }
};
