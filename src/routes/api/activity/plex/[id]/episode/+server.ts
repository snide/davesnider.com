import { activityPlexTable, activityTable, type PlexEpisode } from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

interface UpdateEpisodeRatingRequest {
  episodeIndex: number;
  rating: number | null;
}

export const PATCH: RequestHandler = async ({ params, cookies, request }) => {
  const isAdmin = checkAuth(cookies);

  if (!isAdmin) {
    throw error(401, 'Unauthorized');
  }

  const id = parseInt(params.id);
  if (isNaN(id)) {
    throw error(400, 'Invalid ID');
  }

  let body: UpdateEpisodeRatingRequest;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON body');
  }

  const { episodeIndex, rating } = body;

  // Validate episodeIndex
  if (typeof episodeIndex !== 'number' || episodeIndex < 0) {
    throw error(400, 'Invalid episode index');
  }

  // Validate rating if provided
  if (rating !== null && rating !== undefined) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw error(400, 'Rating must be an integer between 1 and 5');
    }
  }

  try {
    // Find the activity and verify it's a Plex item
    const activity = await db.select().from(activityTable).where(eq(activityTable.id, id)).get();

    if (!activity) {
      throw error(404, 'Activity not found');
    }

    if (activity.type !== 'plex') {
      throw error(400, 'Activity is not a Plex item');
    }

    // Find the Plex details
    const plexDetails = await db.select().from(activityPlexTable).where(eq(activityPlexTable.activityId, id)).get();

    if (!plexDetails) {
      throw error(404, 'Plex details not found');
    }

    if (plexDetails.mediaType !== 'show') {
      throw error(400, 'Activity is not a TV show');
    }

    const episodes = (plexDetails.episodes || []) as PlexEpisode[];

    if (episodeIndex >= episodes.length) {
      throw error(400, 'Episode index out of range');
    }

    // Update the episode rating
    episodes[episodeIndex].rating = rating || undefined;

    await db.update(activityPlexTable).set({ episodes }).where(eq(activityPlexTable.activityId, id));

    return json({ success: true, episodeIndex, rating });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    return json(
      { message: 'Internal Server Error', error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
