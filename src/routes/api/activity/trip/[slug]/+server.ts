import { activityFlightTable, activityTable } from '$db/schema';
import type { TripLeg, TripResponse } from '$lib/components/FlightTrip/types';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const TRIP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Public: every non-private flight tagged with this trip slug, oldest first,
// with the full detail rows (track, channels, photos) so the trip map and the
// per-leg flight card need no follow-up requests. An unknown slug is a valid
// empty trip (data entry happens on the feed after the post exists).
export const GET: RequestHandler = async ({ params }) => {
  const slug = params.slug;
  if (!TRIP_SLUG.test(slug)) {
    return json({ error: 'Invalid trip slug' }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(activityFlightTable)
    .innerJoin(activityTable, eq(activityTable.id, activityFlightTable.activityId))
    .where(and(eq(activityFlightTable.trip, slug), eq(activityTable.isPrivate, false)))
    .orderBy(asc(activityFlightTable.departureTs))
    .all();

  const legs: TripLeg[] = rows.map((r) => ({
    activityId: r.activity.id,
    timestamp: r.activity.timestamp,
    details: r.activity_flight
  }));

  const body: TripResponse = { trip: slug, legs };
  return json(body, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' }
  });
};
