import { activitySteamTable, activityTable, type SteamAchievement } from '$db/schema';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

interface SteamItem {
  externalId: string; // "{appId}_{date}" e.g., "440_2026-06-07"
  timestamp: number; // Latest achievement unlock time in session
  appId: number;
  gameTitle: string;
  gameHeaderUrl?: string;
  gamePosterUrl?: string;
  gameYear?: number;
  gameDeveloper?: string;
  achievements: SteamAchievement[];
}

interface IngestPayload {
  items: SteamItem[];
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
      for (const externalId of payload.deletedIds) {
        const existing = await db
          .select()
          .from(activityTable)
          .where(and(eq(activityTable.type, 'steam'), eq(activityTable.externalId, externalId)))
          .get();

        if (existing) {
          await db.delete(activityTable).where(eq(activityTable.id, existing.id));
          results.deleted++;
        }
      }
    }

    // Process items
    for (const item of payload.items) {
      try {
        // Check for existing item
        const existing = await db
          .select()
          .from(activityTable)
          .where(and(eq(activityTable.type, 'steam'), eq(activityTable.externalId, item.externalId)))
          .get();

        if (existing) {
          // Merge achievements - add new ones to existing
          const existingDetails = await db
            .select()
            .from(activitySteamTable)
            .where(eq(activitySteamTable.activityId, existing.id))
            .get();

          if (existingDetails) {
            const existingAchievements = existingDetails.achievements || [];
            const existingIds = new Set(existingAchievements.map((a) => a.id));

            // Find new achievements
            const newAchievements = item.achievements.filter((a) => !existingIds.has(a.id));

            if (newAchievements.length > 0) {
              // Merge and update
              const mergedAchievements = [...existingAchievements, ...newAchievements];
              const latestTimestamp = Math.max(item.timestamp, existing.timestamp);

              await db
                .update(activitySteamTable)
                .set({
                  achievements: mergedAchievements
                })
                .where(eq(activitySteamTable.activityId, existing.id));

              // Update main activity timestamp
              await db
                .update(activityTable)
                .set({
                  timestamp: latestTimestamp,
                  threadLatestTimestamp: latestTimestamp
                })
                .where(eq(activityTable.id, existing.id));

              results.updated++;
            } else {
              results.skipped++;
            }
          } else {
            results.skipped++;
          }
          continue;
        }

        // Create the activity record
        const [activity] = await db
          .insert(activityTable)
          .values({
            type: 'steam',
            externalId: item.externalId,
            timestamp: item.timestamp,
            isPrivate: false,
            isThreadRoot: true,
            threadLatestTimestamp: item.timestamp
          })
          .returning();

        // Create the Steam-specific record
        await db.insert(activitySteamTable).values({
          activityId: activity.id,
          appId: item.appId,
          gameTitle: item.gameTitle,
          gameHeaderUrl: item.gameHeaderUrl || null,
          gamePosterUrl: item.gamePosterUrl || null,
          gameYear: item.gameYear ?? null,
          gameDeveloper: item.gameDeveloper || null,
          achievements: item.achievements
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
