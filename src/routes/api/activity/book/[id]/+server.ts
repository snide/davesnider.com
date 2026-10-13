import { activityBookTable, activityTable } from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, cookies }) => {
  if (!checkAuth(cookies)) {
    throw error(401, 'Unauthorized');
  }

  const id = parseInt(params.id);
  if (isNaN(id)) {
    throw error(400, 'Invalid ID');
  }

  try {
    const activity = await db.select().from(activityTable).where(eq(activityTable.id, id)).get();

    if (!activity) {
      throw error(404, 'Activity not found');
    }

    if (activity.type !== 'book') {
      throw error(400, 'Activity is not a book item');
    }

    await db.delete(activityBookTable).where(eq(activityBookTable.activityId, id));
    await db.delete(activityTable).where(eq(activityTable.id, id));

    return json({ success: true, deleted: id });
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

// Update review, rating, and year for book items
export const PATCH: RequestHandler = async ({ params, cookies, request }) => {
  if (!checkAuth(cookies)) {
    throw error(401, 'Unauthorized');
  }

  const id = parseInt(params.id);
  if (isNaN(id)) {
    throw error(400, 'Invalid ID');
  }

  try {
    const body = await request.json();
    const { review, rating, year } = body;

    if (rating !== undefined && rating !== null) {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw error(400, 'Rating must be an integer between 1 and 5');
      }
    }

    if (year !== undefined && year !== null) {
      if (!Number.isInteger(year) || year < 1 || year > 2100) {
        throw error(400, 'Year must be a four-digit integer');
      }
    }

    const activity = await db.select().from(activityTable).where(eq(activityTable.id, id)).get();

    if (!activity) {
      throw error(404, 'Activity not found');
    }

    if (activity.type !== 'book') {
      throw error(400, 'Activity is not a book item');
    }

    const bookDetails = await db.select().from(activityBookTable).where(eq(activityBookTable.activityId, id)).get();

    if (!bookDetails) {
      throw error(404, 'Book details not found');
    }

    const updateData: { review?: string | null; rating?: number | null; year?: number | null } = {};
    if (review !== undefined) {
      updateData.review = review;
    }
    if (rating !== undefined) {
      updateData.rating = rating;
    }
    if (year !== undefined) {
      updateData.year = year;
    }

    if (Object.keys(updateData).length === 0) {
      throw error(400, 'Nothing to update');
    }

    await db.update(activityBookTable).set(updateData).where(eq(activityBookTable.activityId, id));

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
