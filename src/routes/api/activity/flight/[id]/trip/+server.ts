import { activityFlightTable } from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const TRIP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TRIP_MAX = 64;
const STOP_MAX = 120;

class BadRequest extends Error {}

// undefined = field absent (leave alone); null / blank = clear; else trimmed
function normalize(value: unknown, max: number, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new BadRequest(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > max) throw new BadRequest(`${field} must be at most ${max} characters`);
  return trimmed;
}

// Admin-only: tag a flight (id = activity id) as a leg of a challenge trip and
// optionally name the goal its arrival reached. Body: { trip?, tripStop? }.
export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
  if (!checkAuth(cookies)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const activityId = Number(params.id);
  if (!Number.isInteger(activityId) || activityId <= 0) {
    return json({ error: 'Invalid activity id' }, { status: 400 });
  }

  let body: { trip?: unknown; tripStop?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let trip: string | null | undefined;
  let tripStop: string | null | undefined;
  try {
    trip = normalize(body.trip, TRIP_MAX, 'trip');
    tripStop = normalize(body.tripStop, STOP_MAX, 'tripStop');
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Bad request' }, { status: 400 });
  }
  if (trip != null && !TRIP_SLUG.test(trip)) {
    return json({ error: 'trip must be a lowercase slug (a-z, 0-9, hyphens)' }, { status: 400 });
  }

  const existing = await db
    .select({ trip: activityFlightTable.trip, tripStop: activityFlightTable.tripStop })
    .from(activityFlightTable)
    .where(eq(activityFlightTable.activityId, activityId))
    .get();
  if (!existing) {
    return json({ error: 'Flight not found' }, { status: 404 });
  }

  // A stop without a trip is meaningless: clearing the trip clears the stop.
  const nextTrip = trip === undefined ? existing.trip : trip;
  const nextStop = nextTrip === null ? null : tripStop === undefined ? existing.tripStop : tripStop;

  await db
    .update(activityFlightTable)
    .set({ trip: nextTrip, tripStop: nextStop })
    .where(eq(activityFlightTable.activityId, activityId));

  return json({ trip: nextTrip, tripStop: nextStop });
};
