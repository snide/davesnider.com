import {
  activityBlueskyTable,
  activityGithubTable,
  activityHackernewsTable,
  activityPlexTable,
  activityRedditTable,
  activityTable
} from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
  const isAdmin = checkAuth(cookies);
  const id = parseInt(params.id);

  if (isNaN(id)) {
    throw error(400, 'Invalid ID');
  }

  const activity = await db.select().from(activityTable).where(eq(activityTable.id, id)).get();

  if (!activity) {
    throw error(404, 'Activity not found');
  }

  // Check if private and not admin
  if (activity.isPrivate && !isAdmin) {
    throw error(404, 'Activity not found');
  }

  let details = null;

  switch (activity.type) {
    case 'plex':
      details = await db.select().from(activityPlexTable).where(eq(activityPlexTable.activityId, activity.id)).get();
      break;
    case 'github':
      details = await db
        .select()
        .from(activityGithubTable)
        .where(eq(activityGithubTable.activityId, activity.id))
        .get();
      break;
    case 'bluesky':
      details = await db
        .select()
        .from(activityBlueskyTable)
        .where(eq(activityBlueskyTable.activityId, activity.id))
        .get();
      break;
    case 'reddit':
      details = await db
        .select()
        .from(activityRedditTable)
        .where(eq(activityRedditTable.activityId, activity.id))
        .get();
      break;
    case 'hackernews':
      details = await db
        .select()
        .from(activityHackernewsTable)
        .where(eq(activityHackernewsTable.activityId, activity.id))
        .get();
      break;
  }

  return {
    activity: {
      ...activity,
      details
    },
    isAdmin
  };
};
