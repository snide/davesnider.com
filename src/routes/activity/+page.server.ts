import {
  activityBlueskyTable,
  activityGithubTable,
  activityHackernewsTable,
  activityPlexTable,
  activityRedditTable,
  activityTable,
  VALID_ACTIVITY_TYPES,
  type ActivityType
} from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { and, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

function isValidActivityType(type: string): type is ActivityType {
  return VALID_ACTIVITY_TYPES.includes(type as ActivityType);
}

export const load: PageServerLoad = async ({ url, cookies }) => {
  const isAdmin = checkAuth(cookies);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 20;
  const typeFilterParam = url.searchParams.get('type');
  const typeFilter = typeFilterParam && isValidActivityType(typeFilterParam) ? typeFilterParam : null;

  const offset = (page - 1) * limit;

  const conditions = [];

  if (!isAdmin) {
    conditions.push(eq(activityTable.isPrivate, false));
  }

  if (typeFilter) {
    conditions.push(eq(activityTable.type, typeFilter));
  }

  const activities = await db
    .select()
    .from(activityTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(activityTable.timestamp))
    .limit(limit)
    .offset(offset);

  // Fetch type-specific details for each activity
  const activitiesWithDetails = await Promise.all(
    activities.map(async (activity) => {
      let details = null;

      switch (activity.type) {
        case 'plex':
          details = await db
            .select()
            .from(activityPlexTable)
            .where(eq(activityPlexTable.activityId, activity.id))
            .get();
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
        ...activity,
        details
      };
    })
  );

  return {
    activities: activitiesWithDetails,
    page,
    typeFilter,
    isAdmin
  };
};
