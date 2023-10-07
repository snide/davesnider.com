import type { APIRoute } from 'astro';
import { xata } from '@lib/xata';

export const POST: APIRoute = async ({ params }) => {
  const { id, action } = params;

  if (!id || !action) {
    return new Response(null, {
      status: 400,
      statusText: 'Bad request'
    });
  }

  try {
    switch (action) {
      case 'hide':
        await xata.db.files.update(id, { isHidden: true });
        break;
      case 'unhide':
        await xata.db.files.update(id, { isHidden: false });
        break;
      case 'favorite':
        await xata.db.files.update(id, { isFavorite: true });
        break;
      case 'unfavorite':
        await xata.db.files.update(id, { isFavorite: false });
        break;
      case 'delete':
        await xata.db.files.delete(id);
        break;
      default:
        return new Response(null, {
          status: 404,
          statusText: 'Not found'
        });
    }

    return new Response(JSON.stringify({ message: 'success' }), {
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
