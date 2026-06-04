import { activityHackernewsTable, activityTable } from '$db/schema';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

interface HackernewsItem {
  externalId: string;
  timestamp: number;
  title: string;
  url: string;
  itemType: 'story' | 'comment' | 'ask' | 'show';
  body?: string;
  hnScore?: number;
}

interface IngestPayload {
  items: HackernewsItem[];
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
        .where(and(eq(activityTable.type, 'hackernews'), inArray(activityTable.externalId, payload.deletedIds)));

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
          .where(and(eq(activityTable.type, 'hackernews'), eq(activityTable.externalId, item.externalId)))
          .get();

        if (existing) {
          results.skipped++;
          continue;
        }

        // Create the activity record
        const [activity] = await db
          .insert(activityTable)
          .values({
            type: 'hackernews',
            externalId: item.externalId,
            timestamp: item.timestamp,
            title: item.title,
            url: item.url,
            thumbnailUrl: null,
            isPrivate: false
          })
          .returning();

        // Create the Hackernews-specific record
        await db.insert(activityHackernewsTable).values({
          activityId: activity.id,
          itemType: item.itemType,
          body: item.body || null,
          hnScore: item.hnScore ?? null
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
    console.error('Error processing Hackernews ingest:', err);
    return json(
      { error: 'Internal Server Error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
