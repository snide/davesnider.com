import { filesTable } from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const VALID_ACTIONS = ['hide', 'unhide', 'favorite', 'unfavorite', 'delete'] as const;
type Action = (typeof VALID_ACTIONS)[number];

export const POST: RequestHandler = async ({ params, cookies }) => {
  const isAdmin = checkAuth(cookies);

  if (!isAdmin) {
    throw error(401, 'Unauthorized');
  }

  const action = params.action as Action;
  const fileId = params.id;

  if (!VALID_ACTIONS.includes(action)) {
    throw error(400, `Invalid action: ${action}`);
  }

  const file = await db.select().from(filesTable).where(eq(filesTable.fileId, fileId)).get();

  if (!file) {
    throw error(404, 'File not found');
  }

  if (action === 'delete') {
    await db.delete(filesTable).where(eq(filesTable.fileId, fileId));
    return json({ deleted: true, fileId });
  }

  let updateData: { isHidden?: boolean; isFavorite?: boolean } = {};

  switch (action) {
    case 'hide':
      updateData = { isHidden: true };
      break;
    case 'unhide':
      updateData = { isHidden: false };
      break;
    case 'favorite':
      updateData = { isFavorite: true };
      break;
    case 'unfavorite':
      updateData = { isFavorite: false };
      break;
  }

  await db.update(filesTable).set(updateData).where(eq(filesTable.fileId, fileId));

  const updatedFile = await db.select().from(filesTable).where(eq(filesTable.fileId, fileId)).get();

  return json(updatedFile);
};
