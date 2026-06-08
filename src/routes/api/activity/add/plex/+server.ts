import { activityPlexTable, activityTable, type PlexEpisode } from '$db/schema';
import { checkAuth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { fetchOmdbById } from '$lib/server/omdb';
import { uploadPosterToR2 } from '$lib/server/r2';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

interface AddPlexRequest {
  imdbId: string;
  timestamp?: number; // Unix timestamp, defaults to now
  rating?: number; // 1-5
}

function formatDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export const POST: RequestHandler = async ({ request, cookies }) => {
  if (!checkAuth(cookies)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: AddPlexRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { imdbId, timestamp: inputTimestamp, rating } = body;

  if (!imdbId || !imdbId.startsWith('tt')) {
    return json({ error: 'Invalid IMDB ID. Must start with "tt"' }, { status: 400 });
  }

  if (rating !== undefined && (rating < 1 || rating > 5)) {
    return json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
  }

  // Fetch data from OMDB
  const data = await fetchOmdbById(imdbId);
  if (!data || data.Response !== 'True') {
    return json({ error: data?.Error || 'Not found in OMDB' }, { status: 404 });
  }

  const timestamp = inputTimestamp || Math.floor(Date.now() / 1000);
  const watchDate = new Date(timestamp * 1000);
  const dateString = formatDateString(watchDate);

  // Handle movie
  if (data.Type === 'movie') {
    const externalId = `movie_${imdbId}_${timestamp}`;

    // Check for existing (exact match unlikely, but check anyway)
    const existing = await db
      .select()
      .from(activityTable)
      .where(and(eq(activityTable.type, 'plex'), eq(activityTable.externalId, externalId)))
      .get();

    if (existing) {
      return json({ message: 'Activity already exists', id: existing.id });
    }

    // Upload poster
    let thumbnailUrl: string | null = null;
    if (data.Poster && data.Poster !== 'N/A') {
      thumbnailUrl = await uploadPosterToR2(data.Poster);
    }

    const director = data.Director && data.Director !== 'N/A' ? data.Director : null;
    const year = data.Year ? parseInt(data.Year, 10) : null;

    // Create activity
    const [activity] = await db
      .insert(activityTable)
      .values({
        type: 'plex',
        externalId,
        timestamp,
        isPrivate: false
      })
      .returning();

    await db.insert(activityPlexTable).values({
      activityId: activity.id,
      title: data.Title || 'Unknown Movie',
      thumbnailUrl,
      mediaType: 'movie',
      imdbId,
      imdbUrl: `https://www.imdb.com/title/${imdbId}/`,
      year,
      duration: null,
      director,
      review: null,
      rating: rating || null
    });

    return json({ success: true, id: activity.id, type: 'movie' });
  }

  // Handle episode
  if (data.Type === 'episode' && data.seriesID) {
    const seriesImdbId = data.seriesID;
    const externalId = `show_${seriesImdbId}_${dateString}`;

    // Upload episode poster
    let episodePosterUrl: string | null = null;
    if (data.Poster && data.Poster !== 'N/A') {
      episodePosterUrl = await uploadPosterToR2(data.Poster);
    }

    // Create episode entry
    const newEpisode: PlexEpisode = {
      imdbId,
      title: data.Title || 'Unknown Episode',
      season: data.Season ? parseInt(data.Season, 10) : 0,
      episode: data.Episode ? parseInt(data.Episode, 10) : 0,
      posterUrl: episodePosterUrl || undefined,
      watchedAt: timestamp,
      rating: rating || undefined
    };

    // Check for existing activity (same show, same day)
    const existing = await db
      .select()
      .from(activityTable)
      .innerJoin(activityPlexTable, eq(activityPlexTable.activityId, activityTable.id))
      .where(and(eq(activityTable.type, 'plex'), eq(activityTable.externalId, externalId)))
      .get();

    if (existing) {
      // Merge: add episode to existing activity
      const existingEpisodes = (existing.activity_plex.episodes || []) as PlexEpisode[];

      // Check if this episode already exists
      const alreadyExists = existingEpisodes.some((ep) => ep.imdbId === imdbId);
      if (alreadyExists) {
        return json({ message: 'Episode already exists in activity', id: existing.activity.id });
      }

      const updatedEpisodes = [...existingEpisodes, newEpisode];

      await db
        .update(activityPlexTable)
        .set({ episodes: updatedEpisodes })
        .where(eq(activityPlexTable.activityId, existing.activity.id));

      // Update timestamp to latest
      await db.update(activityTable).set({ timestamp }).where(eq(activityTable.id, existing.activity.id));

      return json({
        success: true,
        id: existing.activity.id,
        type: 'episode',
        merged: true,
        episodeCount: updatedEpisodes.length
      });
    }

    // New activity: fetch series data
    const seriesData = await fetchOmdbById(seriesImdbId);
    let showTitle = 'Unknown Show';
    let showYear: number | null = null;
    let showPosterUrl: string | null = null;

    if (seriesData && seriesData.Response === 'True') {
      showTitle = seriesData.Title || showTitle;
      showYear = seriesData.Year ? parseInt(seriesData.Year, 10) : null;

      if (seriesData.Poster && seriesData.Poster !== 'N/A') {
        showPosterUrl = await uploadPosterToR2(seriesData.Poster);
      }
    }

    // Create activity
    const [activity] = await db
      .insert(activityTable)
      .values({
        type: 'plex',
        externalId,
        timestamp,
        isPrivate: false
      })
      .returning();

    await db.insert(activityPlexTable).values({
      activityId: activity.id,
      title: showTitle,
      thumbnailUrl: showPosterUrl,
      mediaType: 'show',
      imdbId: seriesImdbId,
      imdbUrl: `https://www.imdb.com/title/${seriesImdbId}/`,
      year: showYear,
      duration: null,
      director: null,
      review: null,
      rating: null,
      episodes: [newEpisode]
    });

    return json({ success: true, id: activity.id, type: 'episode', merged: false });
  }

  // Handle series (add directly as a show without episodes)
  if (data.Type === 'series') {
    const externalId = `series_${imdbId}_${timestamp}`;

    // Upload poster
    let thumbnailUrl: string | null = null;
    if (data.Poster && data.Poster !== 'N/A') {
      thumbnailUrl = await uploadPosterToR2(data.Poster);
    }

    const year = data.Year ? parseInt(data.Year, 10) : null;

    const [activity] = await db
      .insert(activityTable)
      .values({
        type: 'plex',
        externalId,
        timestamp,
        isPrivate: false
      })
      .returning();

    await db.insert(activityPlexTable).values({
      activityId: activity.id,
      title: data.Title || 'Unknown Series',
      thumbnailUrl,
      mediaType: 'show',
      imdbId,
      imdbUrl: `https://www.imdb.com/title/${imdbId}/`,
      year,
      duration: null,
      director: null,
      review: null,
      rating: rating || null,
      episodes: []
    });

    return json({ success: true, id: activity.id, type: 'series' });
  }

  return json({ error: 'Unsupported media type', type: data.Type }, { status: 400 });
};
