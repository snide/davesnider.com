import { activityBookTable, activityTable, VALID_BOOK_FORMATS, type BookFormat } from '#db/schema.js';
import { checkAuth } from '#lib/server/auth.js';
import { db } from '#lib/server/db.js';
import { coverUrl, openLibraryWorkUrl } from '#lib/server/openlibrary.js';
import { uploadImageToR2WithHash } from '#lib/server/r2.js';
import { formatUserDate } from '#lib/utils/timezone.js';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

interface AddBookRequest {
  key: string; // Open Library work OLID, e.g. "OL27448W"
  title: string;
  author?: string | null;
  coverId?: number | null; // Open Library cover_i
  coverUrl?: string | null; // Optional override (any image URL)
  year?: number | null;
  format: BookFormat;
  timestamp?: number; // Unix seconds, when finished; defaults to now
  rating?: number; // 1-5
}

const OLID_RE = /^OL\d+W$/;

export const POST: RequestHandler = async ({ request, cookies }) => {
  if (!checkAuth(cookies)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: AddBookRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const key = typeof body.key === 'string' ? body.key.replace(/^\/works\//, '').trim() : '';
  if (!OLID_RE.test(key)) {
    return Response.json({ error: 'Invalid Open Library work key. Expected an OLID like OL27448W.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return Response.json({ error: 'Title is required' }, { status: 400 });
  }

  if (!VALID_BOOK_FORMATS.includes(body.format)) {
    return Response.json({ error: `Format must be one of ${VALID_BOOK_FORMATS.join(', ')}` }, { status: 400 });
  }

  const rating = body.rating;
  if (rating !== undefined && rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return Response.json({ error: 'Rating must be an integer between 1 and 5' }, { status: 400 });
  }

  const overrideUrl = typeof body.coverUrl === 'string' ? body.coverUrl.trim() : '';
  if (overrideUrl && !/^https?:\/\//.test(overrideUrl)) {
    return Response.json({ error: 'Cover URL override must be an http(s) URL' }, { status: 400 });
  }

  const coverId = Number.isInteger(body.coverId) ? (body.coverId as number) : null;
  const year = Number.isInteger(body.year) ? (body.year as number) : null;
  const author = typeof body.author === 'string' && body.author.trim() ? body.author.trim() : null;

  const timestamp = body.timestamp || Math.floor(Date.now() / 1000);
  const dateString = formatUserDate(new Date(timestamp * 1000));
  const externalId = `book_${key}_${dateString}`;

  const existing = await db
    .select()
    .from(activityTable)
    .where(and(eq(activityTable.type, 'book'), eq(activityTable.externalId, externalId)))
    .get();

  if (existing) {
    return Response.json({ message: 'Activity already exists', id: existing.id });
  }

  // Cover: override wins, else the Open Library cover by ID. Missing covers 404 → null.
  const sourceCover = overrideUrl || (coverId ? coverUrl(coverId, 'L') : null);
  const thumbnailUrl = sourceCover ? await uploadImageToR2WithHash(sourceCover, 'book') : null;

  const activityId = await db.transaction(async (tx) => {
    const [activity] = await tx
      .insert(activityTable)
      .values({
        type: 'book',
        externalId,
        timestamp,
        isPrivate: false
      })
      .returning();

    await tx.insert(activityBookTable).values({
      activityId: activity.id,
      title,
      author,
      thumbnailUrl,
      openLibraryKey: key,
      openLibraryUrl: openLibraryWorkUrl(key),
      coverId: overrideUrl ? null : coverId,
      year,
      format: body.format,
      review: null,
      rating: rating || null
    });

    return activity.id;
  });

  return Response.json({ success: true, id: activityId, coverUploaded: !!thumbnailUrl });
};
