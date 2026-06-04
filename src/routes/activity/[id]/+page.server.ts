import {
  activityBggTable,
  activityBlueskyTable,
  activityGithubTable,
  activityHackernewsTable,
  activityPlexTable,
  activityRedditTable,
  activityTable,
  blueskyAuthorsTable,
  type BlueskyThreadPost,
  type SelectBlueskyAuthor
} from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
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
  let blueskyThread: BlueskyThreadPost[] = [];
  let blueskyAuthors: Record<string, SelectBlueskyAuthor> = {};

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
    case 'bluesky': {
      const blueskyDetails = await db
        .select()
        .from(activityBlueskyTable)
        .where(eq(activityBlueskyTable.activityId, activity.id))
        .get();
      details = blueskyDetails;

      if (blueskyDetails) {
        // Collect author DIDs
        const authorDids = new Set<string>();
        if (blueskyDetails.authorDid) {
          authorDids.add(blueskyDetails.authorDid);
        }
        if (blueskyDetails.threadPosts) {
          for (const post of blueskyDetails.threadPosts) {
            authorDids.add(post.authorDid);
          }
        }

        // Fetch authors
        if (authorDids.size > 0) {
          const authors = await db
            .select()
            .from(blueskyAuthorsTable)
            .where(inArray(blueskyAuthorsTable.did, Array.from(authorDids)));

          for (const author of authors) {
            blueskyAuthors[author.did] = author;
          }
        }

        // Build thread
        const storedThreadPosts = blueskyDetails.threadPosts || [];
        const currentPost: BlueskyThreadPost = {
          uri: activity.externalId,
          authorDid: blueskyDetails.authorDid || '',
          postText: blueskyDetails.postText,
          createdAt: new Date(activity.timestamp * 1000).toISOString(),
          images: blueskyDetails.images || undefined,
          facets: blueskyDetails.facets || undefined
        };

        blueskyThread = storedThreadPosts.length > 0 ? storedThreadPosts : [currentPost];
      }
      break;
    }
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
    case 'bgg':
      details = await db.select().from(activityBggTable).where(eq(activityBggTable.activityId, activity.id)).get();
      break;
  }

  return {
    activity: {
      ...activity,
      details
    },
    blueskyThread,
    blueskyAuthors,
    isAdmin
  };
};
