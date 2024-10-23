import type { APIRoute } from 'astro';
import { isAuthenticated } from '@lib/auth-check';
import { db } from '@db/db';
import { filesTable } from '@db/schema';
import { eq } from 'drizzle-orm';
import { buildImage } from '@lib/image';

export const POST: APIRoute = async ({ params, request }) => {
  const { id } = params;

  // @ts-ignore-next-line
  const isAdmin = isAuthenticated({ request });

  if (!isAdmin) {
    return new Response(null, {
      status: 401,
      statusText: 'Unauthorized'
    });
  }

  if (!id) {
    return new Response(null, {
      status: 400,
      statusText: 'Bad request'
    });
  }

  try {
    const file = await db.select().from(filesTable).where(eq(filesTable.fileId, id)).get();
    const thumb = (await buildImage(file?.url as string, 'width=600,height=600,fit=contain')) || undefined;
    const fileWithThumb = { ...file, thumb };

    return new Response(JSON.stringify(fileWithThumb), {
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
