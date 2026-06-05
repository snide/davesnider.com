import { activityTable, VALID_ACTIVITY_TYPES, type ActivityType } from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, cookies }) => {
  // Admin only
  if (!checkAuth(cookies)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = params.type as ActivityType;

  if (!VALID_ACTIVITY_TYPES.includes(type)) {
    return json({ error: 'Invalid activity type' }, { status: 400 });
  }

  const deleted = await db.delete(activityTable).where(eq(activityTable.type, type)).returning();

  return json({ success: true, deleted: deleted.length });
};
