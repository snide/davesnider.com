import { activityBggTable, activityTable } from '$db/schema';
import { db } from '$lib/server/db';
import { uploadImageToR2WithHash } from '$lib/server/r2';
import { json } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.ACTIVITY_INGEST_TOKEN;
  return Boolean(expectedToken) && authHeader === `Bearer ${expectedToken}`;
}

// The worker reads this before syncing so it only pulls the delta from BGG:
// the latest play date it should fetch from, and the games it already has
// metadata for (so it can skip those `thing` lookups).
export const GET: RequestHandler = async ({ request }) => {
  if (!process.env.ACTIVITY_INGEST_TOKEN) {
    return json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!isAuthorized(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const latest = await db
    .select({ playDate: activityBggTable.playDate })
    .from(activityBggTable)
    .orderBy(desc(activityBggTable.playDate))
    .limit(1)
    .get();

  const games = await db.selectDistinct({ gameId: activityBggTable.gameId }).from(activityBggTable);

  return json({ latestPlayDate: latest?.playDate ?? null, gameIds: games.map((g) => g.gameId) });
};

interface BggItem {
  externalId: string; // Play ID
  timestamp: number;
  title: string; // Game name
  url: string; // Link to game on BGG
  thumbnailUrl?: string; // BGG box art (uploaded to R2 on ingest)
  gameId: number;
  gameYear?: number;
  playDate: string; // YYYY-MM-DD
  location?: string;
  numPlayers?: number;
  won?: boolean;
  coop?: boolean;
  comments?: string;
  incomplete?: boolean;
}

interface IngestPayload {
  items: BggItem[];
  deletedIds?: string[];
}

export const POST: RequestHandler = async ({ request }) => {
  // Validate bearer token
  if (!process.env.ACTIVITY_INGEST_TOKEN) {
    return json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!isAuthorized(request)) {
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

    // A full backlog has many plays of the same game; cache the R2 upload per
    // source URL so we only fetch + store each piece of box art once.
    const boxArtCache = new Map<string, string | null>();
    const uploadBoxArt = async (url: string | undefined): Promise<string | null> => {
      if (!url) return null;
      if (boxArtCache.has(url)) return boxArtCache.get(url)!;
      const r2Url = await uploadImageToR2WithHash(url, 'bgg');
      boxArtCache.set(url, r2Url);
      return r2Url;
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

        // Resolve game metadata. The worker sends it only for games we don't
        // already have; for known games, reuse it from an existing play so we
        // don't re-upload box art or refetch from BGG.
        let boxArtR2Url: string | null;
        let gameYear: number | null;
        let coop: boolean | null;
        if (item.thumbnailUrl || item.gameYear != null || item.coop != null) {
          boxArtR2Url = await uploadBoxArt(item.thumbnailUrl);
          gameYear = item.gameYear ?? null;
          coop = item.coop ?? null;
        } else {
          const prior = await db
            .select({
              thumbnailUrl: activityBggTable.thumbnailUrl,
              gameYear: activityBggTable.gameYear,
              coop: activityBggTable.coop
            })
            .from(activityBggTable)
            .where(eq(activityBggTable.gameId, item.gameId))
            .limit(1)
            .get();
          boxArtR2Url = prior?.thumbnailUrl ?? null;
          gameYear = prior?.gameYear ?? null;
          coop = prior?.coop ?? null;
        }

        // Insert the activity row and its BGG detail row together so a failure
        // on the detail insert can't leave an orphaned activity row (which would
        // otherwise render as a card with null details).
        await db.transaction(async (tx) => {
          const [activity] = await tx
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

          await tx.insert(activityBggTable).values({
            activityId: activity.id,
            title: item.title,
            thumbnailUrl: boxArtR2Url,
            gameId: item.gameId,
            gameYear,
            playDate: item.playDate,
            location: item.location || null,
            numPlayers: item.numPlayers ?? null,
            won: item.won ?? null,
            coop,
            comments: item.comments || null,
            incomplete: item.incomplete ?? false
          });
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
