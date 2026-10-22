import { filesTable } from '#db/schema.js';
import { checkAuth } from '#lib/server/auth.js';
import { db } from '#lib/server/db.js';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, cookies }) => {
  const isAdmin = checkAuth(cookies);

  if (!isAdmin) {
    throw error(401, 'Unauthorized');
  }

  const file = await db.select().from(filesTable).where(eq(filesTable.fileId, params.id)).get();

  if (!file) {
    throw error(404, 'File not found');
  }

  return Response.json(file);
};
