import { activityTable } from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// Hide activity by setting isPrivate to true
export const DELETE: RequestHandler = async ({ params, cookies }) => {
  const isAdmin = checkAuth(cookies);

  if (!isAdmin) {
    throw error(401, 'Unauthorized');
  }

  const id = parseInt(params.id);
  if (isNaN(id)) {
    throw error(400, 'Invalid ID');
  }

  try {
    const activity = await db.select().from(activityTable).where(eq(activityTable.id, id)).get();

    if (!activity) {
      throw error(404, 'Activity not found');
    }

    // Mark as private instead of deleting - prevents re-ingestion
    await db.update(activityTable).set({ isPrivate: true }).where(eq(activityTable.id, id));

    return json({ success: true, hidden: id });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    return json(
      { message: 'Internal Server Error', error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
