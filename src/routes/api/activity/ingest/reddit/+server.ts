import { activityRedditTable, activityTable } from '$db/schema';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

interface RedditItem {
  externalId: string;
  timestamp: number;
  title: string;
  url: string;
  subreddit: string;
  itemType: 'submission' | 'comment';
  body?: string;
  score?: number;
}

interface IngestPayload {
  items: RedditItem[];
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
      errors: [] as string[]
    };

    // Handle deletions
    if (payload.deletedIds && payload.deletedIds.length > 0) {
      const toDelete = await db
        .select()
        .from(activityTable)
        .where(and(eq(activityTable.type, 'reddit'), inArray(activityTable.externalId, payload.deletedIds)));

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
          .where(and(eq(activityTable.type, 'reddit'), eq(activityTable.externalId, item.externalId)))
          .get();

        if (existing) {
          results.skipped++;
          continue;
        }

        // Create the activity record
        const [activity] = await db
          .insert(activityTable)
          .values({
            type: 'reddit',
            externalId: item.externalId,
            timestamp: item.timestamp,
            title: item.title,
            url: item.url,
            thumbnailUrl: null,
            isPrivate: false
          })
          .returning();

        // Create the Reddit-specific record
        await db.insert(activityRedditTable).values({
          activityId: activity.id,
          subreddit: item.subreddit,
          itemType: item.itemType,
          body: item.body || null,
          score: item.score ?? null
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
    console.error('Error processing Reddit ingest:', err);
    return json(
      { error: 'Internal Server Error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
