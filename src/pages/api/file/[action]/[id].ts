import type { APIRoute } from 'astro';
import { isAuthenticated } from '@lib/auth-check';
import { db } from '@db/db';
import { filesTable } from '@db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ params, request }) => {
  const { id, action } = params;

  // @ts-ignore-next-line
  const isAdmin = isAuthenticated({ request });

  if (!isAdmin) {
    return new Response(null, {
      status: 401,
      statusText: 'Unauthorized'
    });
  }

  if (!id || !action) {
    return new Response(null, {
      status: 400,
      statusText: 'Bad request'
    });
  }

  try {
    switch (action) {
      case 'hide':
        await db.update(filesTable).set({ isHidden: true }).where(eq(filesTable.fileId, id)).run();
        break;
      case 'unhide':
        await db.update(filesTable).set({ isHidden: false }).where(eq(filesTable.fileId, id)).run();
        break;
      case 'favorite':
        await db.update(filesTable).set({ isFavorite: true }).where(eq(filesTable.fileId, id)).run();
        break;
      case 'unfavorite':
        await db.update(filesTable).set({ isFavorite: false }).where(eq(filesTable.fileId, id)).run();
        break;
      case 'delete':
        await db.delete(filesTable).where(eq(filesTable.fileId, id)).run();
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
