import { activityFlightTable, activityTable, type FlightPhoto } from '#db/schema.js';
import { db } from '#lib/server/db.js';
import { uploadBufferToR2WithHash } from '#lib/server/r2.js';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PHOTOS = 12;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.ACTIVITY_INGEST_TOKEN;
  return Boolean(expectedToken) && authHeader === `Bearer ${expectedToken}`;
}

// Pushed by the flight recorder after the flight itself: one photo-mode
// screenshot pinned to a flight moment. Idempotent — appends dedupe by URL
// (images are content-addressed), so replays re-attach harmlessly.
export const POST: RequestHandler = async ({ request }) => {
  if (!process.env.ACTIVITY_INGEST_TOKEN) {
    return Response.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await request.formData();
  const externalId = form.get('externalId');
  const t = Number(form.get('t'));
  const lat = Number(form.get('lat'));
  const lon = Number(form.get('lon'));
  const file = form.get('file');

  if (typeof externalId !== 'string' || !externalId)
    return Response.json({ error: 'Missing externalId' }, { status: 400 });
  if (![t, lat, lon].every(Number.isFinite)) return Response.json({ error: 'Invalid photo metadata' }, { status: 400 });
  if (!(file instanceof File)) return Response.json({ error: 'Missing file' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: 'Unsupported image type' }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: 'Image exceeds 15MB' }, { status: 413 });

  const activity = await db
    .select({ id: activityTable.id })
    .from(activityTable)
    .where(and(eq(activityTable.type, 'flight'), eq(activityTable.externalId, externalId)))
    .get();
  if (!activity) return Response.json({ error: 'Flight not found' }, { status: 404 });

  const flight = await db
    .select({ id: activityFlightTable.id, photos: activityFlightTable.photos })
    .from(activityFlightTable)
    .where(eq(activityFlightTable.activityId, activity.id))
    .get();
  if (!flight) return Response.json({ error: 'Flight not found' }, { status: 404 });

  const url = await uploadBufferToR2WithHash(Buffer.from(await file.arrayBuffer()), file.type, 'flight');
  if (!url) return Response.json({ error: 'Upload failed' }, { status: 502 });

  const photos: FlightPhoto[] = flight.photos ?? [];
  if (!photos.some((p) => p.url === url)) {
    photos.push({ url, t, lat, lon });
    photos.sort((a, b) => a.t - b.t);
    await db
      .update(activityFlightTable)
      .set({ photos: photos.slice(0, MAX_PHOTOS) })
      .where(eq(activityFlightTable.id, flight.id));
  }

  return Response.json({ url });
};
