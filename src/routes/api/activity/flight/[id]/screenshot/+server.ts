import { activityFlightTable } from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { uploadBufferToR2WithHash } from '$lib/server/r2';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

// Admin-only: attach a screenshot to a flight (id = activity id). A re-upload
// replaces the reference; images are content-addressed in R2 so orphans are
// deduped, not leaked.
export const POST: RequestHandler = async ({ params, request, cookies }) => {
  if (!checkAuth(cookies)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const activityId = Number(params.id);
  if (!Number.isInteger(activityId) || activityId <= 0) {
    return json({ error: 'Invalid activity id' }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return json({ error: 'Missing file' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return json({ error: 'Unsupported image type' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return json({ error: 'Image exceeds 15MB' }, { status: 413 });
  }

  const flight = await db
    .select({ id: activityFlightTable.id })
    .from(activityFlightTable)
    .where(eq(activityFlightTable.activityId, activityId))
    .get();
  if (!flight) {
    return json({ error: 'Flight not found' }, { status: 404 });
  }

  const url = await uploadBufferToR2WithHash(Buffer.from(await file.arrayBuffer()), file.type, 'flight');
  if (!url) {
    return json({ error: 'Upload failed' }, { status: 502 });
  }

  await db
    .update(activityFlightTable)
    .set({ screenshotUrl: url })
    .where(eq(activityFlightTable.activityId, activityId));

  return json({ url });
};
