import { activitySteamTable, activityTable, type SteamAchievement } from '$db/schema';
import { db } from '$lib/server/db';
import { uploadImageToR2WithHash } from '$lib/server/r2';
import { json } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

async function uploadAchievementIcons(achievements: SteamAchievement[]): Promise<SteamAchievement[]> {
  return Promise.all(
    achievements.map(async (achievement) => {
      if (achievement.iconUrl) {
        const r2Url = await uploadImageToR2WithHash(achievement.iconUrl, 'steam/achievements');
        return { ...achievement, iconUrl: r2Url || achievement.iconUrl };
      }
      return achievement;
    })
  );
}

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
  playtimeForever: number; // Total playtime in minutes
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
        // Check for existing activity for this game+day
        const existing = await db
          .select()
          .from(activityTable)
          .where(and(eq(activityTable.type, 'steam'), eq(activityTable.externalId, item.externalId)))
          .get();

        if (existing) {
          // Activity exists for this game+day - merge achievements and update playtime
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
            const hasNewAchievements = newAchievements.length > 0;
            const playtimeChanged = existingDetails.playtimeForever !== item.playtimeForever;

            if (hasNewAchievements || playtimeChanged) {
              // Upload icons for new achievements and merge
              const uploadedNewAchievements = hasNewAchievements ? await uploadAchievementIcons(newAchievements) : [];
              const mergedAchievements = hasNewAchievements
                ? [...existingAchievements, ...uploadedNewAchievements]
                : existingAchievements;
              const latestTimestamp = Math.max(item.timestamp, existing.timestamp);

              await db
                .update(activitySteamTable)
                .set({
                  achievements: mergedAchievements,
                  playtimeForever: item.playtimeForever
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

        // No activity exists for this game+day
        // Check if we should create one (has achievements OR playtime increased)
        const hasAchievements = item.achievements.length > 0;

        // Look up the last known playtime for this game from any previous activity
        const lastKnownActivity = await db
          .select({ playtimeForever: activitySteamTable.playtimeForever })
          .from(activitySteamTable)
          .where(eq(activitySteamTable.appId, item.appId))
          .orderBy(desc(activitySteamTable.id))
          .limit(1)
          .get();

        const lastKnownPlaytime = lastKnownActivity?.playtimeForever ?? 0;
        const playtimeIncreased = item.playtimeForever > lastKnownPlaytime;

        // Only create activity if there are achievements or playtime increased
        if (!hasAchievements && !playtimeIncreased) {
          results.skipped++;
          continue;
        }

        // Upload game images to R2
        const gameHeaderR2Url = item.gameHeaderUrl ? await uploadImageToR2WithHash(item.gameHeaderUrl, 'steam') : null;
        const gamePosterR2Url = item.gamePosterUrl ? await uploadImageToR2WithHash(item.gamePosterUrl, 'steam') : null;

        // Upload achievement icons to R2
        const achievementsWithR2Icons = await uploadAchievementIcons(item.achievements);

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
          gameHeaderUrl: gameHeaderR2Url,
          gamePosterUrl: gamePosterR2Url,
          gameYear: item.gameYear ?? null,
          gameDeveloper: item.gameDeveloper || null,
          achievements: achievementsWithR2Icons,
          playtimeForever: item.playtimeForever
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
