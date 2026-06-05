import { activityPlexTable, activityTable } from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// Update review and rating for Plex items
export const PATCH: RequestHandler = async ({ params, cookies, request }) => {
  const isAdmin = checkAuth(cookies);

  if (!isAdmin) {
    throw error(401, 'Unauthorized');
  }

  const id = parseInt(params.id);
  if (isNaN(id)) {
    throw error(400, 'Invalid ID');
  }

  try {
    const body = await request.json();
    const { review, rating } = body;

    // Validate rating if provided
    if (rating !== undefined && rating !== null) {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw error(400, 'Rating must be an integer between 1 and 5');
      }
    }

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

    // Update the Plex details
    const updateData: { review?: string; rating?: number } = {};
    if (review !== undefined) {
      updateData.review = review;
    }
    if (rating !== undefined) {
      updateData.rating = rating;
    }

    await db.update(activityPlexTable).set(updateData).where(eq(activityPlexTable.activityId, id));

    return json({ success: true, ...updateData });
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
