import {
  activityBggTable,
  activityBlueskyTable,
  activityGithubTable,
  activityHackernewsTable,
  activityPlexTable,
  activityRedditTable,
  activitySteamTable,
  activityTable,
  blueskyAuthorsTable,
  VALID_ACTIVITY_TYPES,
  type ActivityType,
  type BlueskyThreadPost,
  type SelectBlueskyAuthor
} from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

function isValidActivityType(type: string): type is ActivityType {
  return VALID_ACTIVITY_TYPES.includes(type as ActivityType);
}

export const load: PageServerLoad = async ({ url, cookies }) => {
  const isAdmin = checkAuth(cookies);
  const limit = 20;
  const typeFilterParam = url.searchParams.get('type');
  const typeFilter = typeFilterParam && isValidActivityType(typeFilterParam) ? typeFilterParam : null;
  const sortOrder = url.searchParams.get('sort') === 'asc' ? 'asc' : 'desc';
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  // Build conditions for the main query
  const conditions = [eq(activityTable.isThreadRoot, true), eq(activityTable.isPrivate, false)];

  if (typeFilter) {
    conditions.push(eq(activityTable.type, typeFilter));
  }

  // Date range filtering
  if (startDate) {
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    conditions.push(gte(activityTable.timestamp, startTimestamp));
  }

  if (endDate) {
    // Add a day to include the entire end date
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000) + 86400;
    conditions.push(lte(activityTable.timestamp, endTimestamp));
  }

  // Single efficient query: get thread roots, sorted by latest activity
  const orderByExpr = sql`COALESCE(${activityTable.threadLatestTimestamp}, ${activityTable.timestamp})`;
  const activities = await db
    .select()
    .from(activityTable)
    .where(and(...conditions))
    .orderBy(sortOrder === 'asc' ? asc(orderByExpr) : desc(orderByExpr))
    .limit(limit);

  // Group activity IDs by type for batch fetching details
  const plexIds: number[] = [];
  const githubIds: number[] = [];
  const blueskyIds: number[] = [];
  const redditIds: number[] = [];
  const hnIds: number[] = [];
  const bggIds: number[] = [];
  const steamIds: number[] = [];

  for (const activity of activities) {
    switch (activity.type) {
      case 'plex':
        plexIds.push(activity.id);
        break;
      case 'github':
        githubIds.push(activity.id);
        break;
      case 'bluesky':
        blueskyIds.push(activity.id);
        break;
      case 'reddit':
        redditIds.push(activity.id);
        break;
      case 'hackernews':
        hnIds.push(activity.id);
        break;
      case 'bgg':
        bggIds.push(activity.id);
        break;
      case 'steam':
        steamIds.push(activity.id);
        break;
    }
  }

  // Batch fetch all details in parallel
  const [plexDetails, githubDetails, blueskyDetails, redditDetails, hnDetails, bggDetails, steamDetails] =
    await Promise.all([
      plexIds.length > 0
        ? db.select().from(activityPlexTable).where(inArray(activityPlexTable.activityId, plexIds))
        : [],
      githubIds.length > 0
        ? db.select().from(activityGithubTable).where(inArray(activityGithubTable.activityId, githubIds))
        : [],
      blueskyIds.length > 0
        ? db.select().from(activityBlueskyTable).where(inArray(activityBlueskyTable.activityId, blueskyIds))
        : [],
      redditIds.length > 0
        ? db.select().from(activityRedditTable).where(inArray(activityRedditTable.activityId, redditIds))
        : [],
      hnIds.length > 0
        ? db.select().from(activityHackernewsTable).where(inArray(activityHackernewsTable.activityId, hnIds))
        : [],
      bggIds.length > 0 ? db.select().from(activityBggTable).where(inArray(activityBggTable.activityId, bggIds)) : [],
      steamIds.length > 0
        ? db.select().from(activitySteamTable).where(inArray(activitySteamTable.activityId, steamIds))
        : []
    ]);

  // Build lookup maps
  const plexMap = new Map(plexDetails.map((d) => [d.activityId, d]));
  const githubMap = new Map(githubDetails.map((d) => [d.activityId, d]));
  const blueskyMap = new Map(blueskyDetails.map((d) => [d.activityId, d]));
  const redditMap = new Map(redditDetails.map((d) => [d.activityId, d]));
  const hnMap = new Map(hnDetails.map((d) => [d.activityId, d]));
  const bggMap = new Map(bggDetails.map((d) => [d.activityId, d]));
  const steamMap = new Map(steamDetails.map((d) => [d.activityId, d]));

  // Collect author DIDs from Bluesky activities
  const authorDids = new Set<string>();
  for (const detail of blueskyDetails) {
    if (detail.authorDid) {
      authorDids.add(detail.authorDid);
    }
    if (detail.threadPosts) {
      for (const post of detail.threadPosts) {
        authorDids.add(post.authorDid);
      }
    }
  }

  // Fetch authors
  const authorsMap: Record<string, SelectBlueskyAuthor> = {};
  if (authorDids.size > 0) {
    const authors = await db
      .select()
      .from(blueskyAuthorsTable)
      .where(inArray(blueskyAuthorsTable.did, Array.from(authorDids)));

    for (const author of authors) {
      authorsMap[author.did] = author;
    }
  }

  // Build the final activities array with details and threads
  type ActivityWithDetails = {
    id: number;
    type: string;
    externalId: string;
    timestamp: number;
    isPrivate: boolean;
    createdAt: Date;
    details: unknown;
    thread?: BlueskyThreadPost[];
  };

  const activitiesWithDetails: ActivityWithDetails[] = activities.map((activity) => {
    let details = null;
    let thread: BlueskyThreadPost[] | undefined;

    switch (activity.type) {
      case 'plex':
        details = plexMap.get(activity.id) || null;
        break;
      case 'github':
        details = githubMap.get(activity.id) || null;
        break;
      case 'bluesky': {
        const blueskyDetail = blueskyMap.get(activity.id);
        details = blueskyDetail || null;

        if (blueskyDetail) {
          // Build thread from stored threadPosts or create single-post thread
          const storedThreadPosts = blueskyDetail.threadPosts || [];
          if (storedThreadPosts.length > 0) {
            thread = storedThreadPosts;
          } else {
            // Single post - create thread array
            thread = [
              {
                uri: activity.externalId,
                authorDid: blueskyDetail.authorDid || '',
                postText: blueskyDetail.postText,
                createdAt: new Date(activity.timestamp * 1000).toISOString(),
                images: blueskyDetail.images || undefined,
                facets: blueskyDetail.facets || undefined
              }
            ];
          }
        }
        break;
      }
      case 'reddit':
        details = redditMap.get(activity.id) || null;
        break;
      case 'hackernews':
        details = hnMap.get(activity.id) || null;
        break;
      case 'bgg':
        details = bggMap.get(activity.id) || null;
        break;
      case 'steam':
        details = steamMap.get(activity.id) || null;
        break;
    }

    return { ...activity, details, thread };
  });

  return {
    activities: activitiesWithDetails,
    blueskyAuthors: authorsMap,
    typeFilter,
    sortOrder,
    startDate,
    endDate,
    isAdmin
  };
};
