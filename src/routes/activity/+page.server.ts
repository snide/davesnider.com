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
import { and, desc, eq, ne } from 'drizzle-orm';
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

  // Build base conditions
  const baseConditions = [];
  if (!isAdmin) {
    baseConditions.push(eq(activityTable.isPrivate, false));
  }

  // Fetch non-Bluesky activities
  const nonBlueskyConditions = [...baseConditions, ne(activityTable.type, 'bluesky')];
  if (typeFilter && typeFilter !== 'bluesky') {
    nonBlueskyConditions.push(eq(activityTable.type, typeFilter));
  }

  const nonBlueskyActivities =
    typeFilter === 'bluesky'
      ? []
      : await db
          .select()
          .from(activityTable)
          .where(and(...nonBlueskyConditions))
          .orderBy(desc(activityTable.timestamp));

  // Fetch Bluesky activities grouped by thread (rootUri)
  // For each thread, get the root post's activity and the max timestamp
  let blueskyThreads: Array<{
    activity: typeof activityTable.$inferSelect;
    details: typeof activityBlueskyTable.$inferSelect;
    maxTimestamp: number;
    rootUri: string;
  }> = [];

  if (!typeFilter || typeFilter === 'bluesky') {
    // Get all Bluesky activities with their details
    const blueskyActivities = await db
      .select({
        activity: activityTable,
        details: activityBlueskyTable
      })
      .from(activityTable)
      .innerJoin(activityBlueskyTable, eq(activityTable.id, activityBlueskyTable.activityId))
      .where(
        and(eq(activityTable.type, 'bluesky'), ...(isAdmin ? [] : [eq(activityTable.isPrivate, false)]))
      )
      .orderBy(desc(activityTable.timestamp));

    // Group by rootUri and find max timestamp for each thread
    const threadMap = new Map<
      string,
      {
        rootActivity: (typeof blueskyActivities)[0] | null;
        maxTimestamp: number;
        posts: (typeof blueskyActivities)[0][];
      }
    >();

    for (const item of blueskyActivities) {
      const rootUri = item.details.rootUri || item.activity.externalId;
      const existing = threadMap.get(rootUri);

      if (!existing) {
        threadMap.set(rootUri, {
          rootActivity: item.activity.externalId === rootUri ? item : null,
          maxTimestamp: item.activity.timestamp,
          posts: [item]
        });
      } else {
        existing.posts.push(item);
        if (item.activity.timestamp > existing.maxTimestamp) {
          existing.maxTimestamp = item.activity.timestamp;
        }
        if (item.activity.externalId === rootUri) {
          existing.rootActivity = item;
        }
      }
    }

    // Convert to array, using root post or first post as representative
    blueskyThreads = Array.from(threadMap.entries()).map(([rootUri, thread]) => {
      // Use root post if we have it, otherwise use the earliest post (last in array since sorted desc)
      const representative = thread.rootActivity || thread.posts[thread.posts.length - 1];
      return {
        activity: representative.activity,
        details: representative.details,
        maxTimestamp: thread.maxTimestamp,
        rootUri
      };
    });
  }

  // Merge and sort all activities by timestamp
  type ActivityWithDetails = {
    id: number;
    type: string;
    externalId: string;
    timestamp: number;
    title: string;
    url: string | null;
    thumbnailUrl: string | null;
    isPrivate: boolean;
    createdAt: Date;
    details: unknown;
    rootUri?: string; // Only for Bluesky threads
  };

  const allActivities: ActivityWithDetails[] = [];

  // Add non-Bluesky activities with their details
  for (const activity of nonBlueskyActivities) {
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

    allActivities.push({ ...activity, details });
  }

  // Add Bluesky threads (using maxTimestamp for sorting)
  for (const thread of blueskyThreads) {
    allActivities.push({
      ...thread.activity,
      timestamp: thread.maxTimestamp, // Use latest post timestamp for sorting
      details: thread.details,
      rootUri: thread.rootUri
    });
  }

  // Sort by timestamp descending
  allActivities.sort((a, b) => b.timestamp - a.timestamp);

  // Apply pagination
  const paginatedActivities = allActivities.slice(offset, offset + limit);

  return {
    activities: paginatedActivities,
    page,
    typeFilter,
    isAdmin
  };
};
