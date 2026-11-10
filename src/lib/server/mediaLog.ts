import { activityPlexTable, activityTable } from '#db/schema.js';
import type { MediaLogItem, MediaLogKind } from '#lib/components/MediaLog/types.js';
import { db } from '#lib/server/db.js';
import { and, desc, eq } from 'drizzle-orm';

// Plex stores co-directors as one comma-joined string
function splitNames(names: string | null): string[] {
  return (names ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

async function getMovies(): Promise<MediaLogItem[]> {
  const rows = await db
    .select({
      id: activityTable.id,
      timestamp: activityTable.timestamp,
      title: activityPlexTable.title,
      director: activityPlexTable.director,
      year: activityPlexTable.year,
      rating: activityPlexTable.rating,
      review: activityPlexTable.review,
      imageUrl: activityPlexTable.thumbnailUrl,
      link: activityPlexTable.imdbUrl
    })
    .from(activityPlexTable)
    .innerJoin(activityTable, eq(activityTable.id, activityPlexTable.activityId))
    .where(and(eq(activityPlexTable.mediaType, 'movie'), eq(activityTable.isPrivate, false)))
    .orderBy(desc(activityTable.timestamp))
    .all();

  return rows.map(({ director, title, review, ...row }) => ({
    ...row,
    title: title ?? 'Untitled',
    creators: splitNames(director),
    review: review?.trim() || null
  }));
}

// Every public item of a kind, newest first, normalized for the MediaLog
// component. A new kind adds a mapper here.
export async function getMediaLog(kind: MediaLogKind): Promise<MediaLogItem[]> {
  switch (kind) {
    case 'movies':
      return getMovies();
  }
}
