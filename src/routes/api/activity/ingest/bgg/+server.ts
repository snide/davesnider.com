import { activityBggTable, activityTable } from '$db/schema';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

interface BggItem {
  externalId: string; // Play ID
  timestamp: number;
  title: string; // Game name
  url: string; // Link to game on BGG
  thumbnailUrl?: string;
  gameId: number;
  playDate: string; // YYYY-MM-DD
  location?: string;
  numPlayers?: number;
  comments?: string;
  incomplete?: boolean;
}

interface IngestPayload {
  items: BggItem[];
  deletedIds?: string[];
}

export const POST: RequestHandler = async ({ request }) => {
  // Validate bearer token
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.ACTIVITY_INGEST_TOKEN;

  if (!expectedToken) {
    return json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload: IngestPayload = await request.json();
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      errors: [] as string[]
    };

    // Handle deletions
    if (payload.deletedIds && payload.deletedIds.length > 0) {
      const toDelete = await db
        .select()
        .from(activityTable)
        .where(and(eq(activityTable.type, 'bgg'), inArray(activityTable.externalId, payload.deletedIds)));

      for (const activity of toDelete) {
        await db.delete(activityTable).where(eq(activityTable.id, activity.id));
        results.deleted++;
      }
    }

    // Process items
    for (const item of payload.items) {
      try {
        // Check for existing item
        const existing = await db
          .select()
          .from(activityTable)
          .where(and(eq(activityTable.type, 'bgg'), eq(activityTable.externalId, item.externalId)))
          .get();

        if (existing) {
          // BGG plays can be edited - update if comments changed
          const existingDetails = await db
            .select()
            .from(activityBggTable)
            .where(eq(activityBggTable.activityId, existing.id))
            .get();

          const commentsChanged = item.comments !== existingDetails?.comments;
          const locationChanged = item.location !== existingDetails?.location;

          if (commentsChanged || locationChanged) {
            await db
              .update(activityBggTable)
              .set({
                comments: item.comments || null,
                location: item.location || null
              })
              .where(eq(activityBggTable.activityId, existing.id));
            results.updated++;
          } else {
            results.skipped++;
          }
          continue;
        }

        // Create the activity record
        const [activity] = await db
          .insert(activityTable)
          .values({
            type: 'bgg',
            externalId: item.externalId,
            timestamp: item.timestamp,
            isPrivate: false,
            isThreadRoot: true,
            threadLatestTimestamp: item.timestamp
          })
          .returning();

        // Create the BGG-specific record
        await db.insert(activityBggTable).values({
          activityId: activity.id,
          title: item.title,
          thumbnailUrl: item.thumbnailUrl || null,
          gameId: item.gameId,
          playDate: item.playDate,
          location: item.location || null,
          numPlayers: item.numPlayers ?? null,
          comments: item.comments || null,
          incomplete: item.incomplete ?? false
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
    return json(
      { error: 'Internal Server Error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
