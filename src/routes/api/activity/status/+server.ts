import { activityTable, VALID_ACTIVITY_TYPES } from '$db/schema';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { count, eq, max } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const status: Record<string, { lastSync: string | null; lastActivity: string | null; count: number }> = {};

  for (const type of VALID_ACTIVITY_TYPES) {
    // Get the most recently synced item (by createdAt) and count
    const [result] = await db
      .select({
        lastSync: max(activityTable.createdAt),
        lastActivity: max(activityTable.timestamp),
        count: count()
      })
      .from(activityTable)
      .where(eq(activityTable.type, type));

    status[type] = {
      lastSync: result?.lastSync ? new Date(result.lastSync).toISOString() : null,
      lastActivity: result?.lastActivity ? new Date(result.lastActivity * 1000).toISOString() : null,
      count: result?.count || 0
    };
  }

  return json({
    status,
    checkedAt: new Date().toISOString()
  });
};
