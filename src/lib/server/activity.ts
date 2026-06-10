import {
  activityBggTable,
  activityBlueskyTable,
  activityGithubTable,
  activityHackernewsTable,
  activityPlexTable,
  activityRedditTable,
  activitySteamTable,
  blueskyAuthorsTable,
  type BlueskyThreadPost,
  type SelectActivity,
  type SelectBlueskyAuthor
} from '$db/schema';
import { db } from '$lib/server/db';
import { inArray, sql } from 'drizzle-orm';

export type ActivityWithDetails = {
  id: number;
  type: string;
  externalId: string;
  timestamp: number;
  isPrivate: boolean;
  createdAt: Date;
  details: unknown;
  thread?: BlueskyThreadPost[];
  titleExcerpt?: string | null;
  bodyExcerpt?: string | null;
};

// Markers wrap matched terms in search excerpts; the client swaps them for
// <mark> elements so excerpt text is never rendered as HTML.
export const SEARCH_MARK_START = '\u0001';
export const SEARCH_MARK_END = '\u0002';

// Turn raw user input into a safe FTS5 MATCH expression: each token becomes a
// quoted prefix phrase, so operators and quotes in the input can't break the
// query syntax.
export function buildMatchQuery(searchTerm: string): string {
  return searchTerm
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replaceAll('"', '""')}"*`)
    .join(' ');
}

export async function attachSearchExcerpts(
  activities: ActivityWithDetails[],
  matchQuery: string
): Promise<ActivityWithDetails[]> {
  if (activities.length === 0) {
    return activities;
  }

  const ids = activities.map((a) => a.id);
  const rows = await db.all<{ id: number; titleExcerpt: string | null; bodyExcerpt: string | null }>(sql`
    SELECT
      rowid AS id,
      highlight(activity_fts, 0, char(1), char(2)) AS titleExcerpt,
      snippet(activity_fts, 1, char(1), char(2), '…', 16) AS bodyExcerpt
    FROM activity_fts
    WHERE activity_fts MATCH ${matchQuery}
      AND rowid IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `
      )})
  `);

  const excerptsById = new Map(rows.map((row) => [row.id, row]));

  return activities.map((activity) => {
    const excerpt = excerptsById.get(activity.id);
    return excerpt ? { ...activity, titleExcerpt: excerpt.titleExcerpt, bodyExcerpt: excerpt.bodyExcerpt } : activity;
  });
}

// Batch-fetch the per-type detail rows for a page of activities and assemble
// the feed shape shared by the activity page load and the list API.
export async function withActivityDetails(activities: SelectActivity[]): Promise<{
  activities: ActivityWithDetails[];
  blueskyAuthors: Record<string, SelectBlueskyAuthor>;
}> {
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
  const blueskyAuthors: Record<string, SelectBlueskyAuthor> = {};
  if (authorDids.size > 0) {
    const authors = await db
      .select()
      .from(blueskyAuthorsTable)
      .where(inArray(blueskyAuthorsTable.did, Array.from(authorDids)));

    for (const author of authors) {
      blueskyAuthors[author.did] = author;
    }
  }

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

  return { activities: activitiesWithDetails, blueskyAuthors };
}
