import type { BlueskyFacet, BlueskyThreadPost } from '$db/schema';
import { activityBlueskyTable, activityTable, blueskyAuthorsTable } from '$db/schema';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

interface Author {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

interface BlueskyItem {
  externalId: string;
  timestamp: number;
  title: string;
  url: string;
  postText: string;
  isReply: boolean;
  replyToUri?: string;
  rootUri: string;
  images?: string[];
  facets?: BlueskyFacet[];
  authorDid: string;
  threadPosts?: BlueskyThreadPost[];
}

interface IngestPayload {
  items: BlueskyItem[];
  authors?: Author[];
  deletedIds?: string[];
}

export const POST: RequestHandler = async ({ request }) => {
  // Validate bearer token
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.ACTIVITY_INGEST_TOKEN;

  if (!expectedToken) {
    console.error('ACTIVITY_INGEST_TOKEN not configured');
    return json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload: IngestPayload = await request.json();
    const results = {
      created: 0,
      skipped: 0,
      deleted: 0,
      authorsUpserted: 0,
      errors: [] as string[]
    };

    // Upsert authors first
    if (payload.authors && payload.authors.length > 0) {
      for (const author of payload.authors) {
        try {
          const existing = await db
            .select()
            .from(blueskyAuthorsTable)
            .where(eq(blueskyAuthorsTable.did, author.did))
            .get();

          if (existing) {
            // Update if any fields changed
            await db
              .update(blueskyAuthorsTable)
              .set({
                handle: author.handle,
                displayName: author.displayName || null,
                avatar: author.avatar || null,
                updatedAt: new Date()
              })
              .where(eq(blueskyAuthorsTable.did, author.did));
          } else {
            // Insert new author
            await db.insert(blueskyAuthorsTable).values({
              did: author.did,
              handle: author.handle,
              displayName: author.displayName || null,
              avatar: author.avatar || null
            });
          }
          results.authorsUpserted++;
        } catch (err) {
          results.errors.push(
            `Failed to upsert author ${author.did}: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      }
    }

    // Handle deletions
    if (payload.deletedIds && payload.deletedIds.length > 0) {
      const toDelete = await db
        .select()
        .from(activityTable)
        .where(and(eq(activityTable.type, 'bluesky'), inArray(activityTable.externalId, payload.deletedIds)));

      for (const activity of toDelete) {
        await db.delete(activityTable).where(eq(activityTable.id, activity.id));
        results.deleted++;
      }
    }

    // Process new items
    for (const item of payload.items) {
      try {
        // Check for duplicates
        const existing = await db
          .select()
          .from(activityTable)
          .where(and(eq(activityTable.type, 'bluesky'), eq(activityTable.externalId, item.externalId)))
          .get();

        if (existing) {
          results.skipped++;
          continue;
        }

        // Determine if this is a thread root
        const isRoot = !item.rootUri || item.rootUri === item.externalId;

        // For replies, find the thread root activity
        let threadRootActivity = null;
        if (!isRoot && item.rootUri) {
          // First, check if we have the actual root post
          threadRootActivity = await db
            .select()
            .from(activityTable)
            .where(and(eq(activityTable.type, 'bluesky'), eq(activityTable.externalId, item.rootUri)))
            .get();

          // If not, check if we have another reply to the same thread that's acting as the root
          if (!threadRootActivity) {
            const existingThreadRoot = await db
              .select({ activity: activityTable })
              .from(activityTable)
              .innerJoin(activityBlueskyTable, eq(activityTable.id, activityBlueskyTable.activityId))
              .where(
                and(
                  eq(activityTable.type, 'bluesky'),
                  eq(activityTable.isThreadRoot, true),
                  eq(activityBlueskyTable.rootUri, item.rootUri)
                )
              )
              .get();

            if (existingThreadRoot) {
              threadRootActivity = existingThreadRoot.activity;
            }
          }

          // Update root's threadLatestTimestamp if this post is newer
          if (threadRootActivity && item.timestamp > (threadRootActivity.threadLatestTimestamp || 0)) {
            await db
              .update(activityTable)
              .set({ threadLatestTimestamp: item.timestamp })
              .where(eq(activityTable.id, threadRootActivity.id));
          }
        }

        // If this is a reply but no thread root exists yet, treat it as its own thread root
        const effectiveIsRoot = isRoot || !threadRootActivity;

        // Create the activity record
        const [activity] = await db
          .insert(activityTable)
          .values({
            type: 'bluesky',
            externalId: item.externalId,
            timestamp: item.timestamp,
            title: item.title,
            url: item.url,
            thumbnailUrl: null,
            isPrivate: false,
            isThreadRoot: effectiveIsRoot,
            threadLatestTimestamp: effectiveIsRoot ? item.timestamp : null
          })
          .returning();

        // Create the Bluesky-specific record
        await db.insert(activityBlueskyTable).values({
          activityId: activity.id,
          authorDid: item.authorDid,
          postText: item.postText,
          isReply: item.isReply,
          replyToUri: item.replyToUri || null,
          rootUri: item.rootUri,
          images: item.images || null,
          facets: item.facets || null,
          threadPosts: item.threadPosts || null
        });

        results.created++;
      } catch (err) {
        results.errors.push(
          `Failed to process item ${item.externalId}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }

    return json({ success: true, results });
  } catch (err) {
    console.error('Error processing Bluesky ingest:', err);
    return json(
      { error: 'Internal Server Error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
