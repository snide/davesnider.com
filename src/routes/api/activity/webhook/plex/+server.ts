import {
  activityPlexTable,
  activityTable,
  VALID_PLEX_MEDIA_TYPES,
  type PlexEpisode,
  type PlexMediaType
} from '$db/schema';
import { db } from '$lib/server/db';
import { extractImdbIdFromGuids, fetchOmdbById, fetchOmdbByTitle } from '$lib/server/omdb';
import { uploadImageToR2WithHash } from '$lib/server/r2';
import { formatUserDate } from '$lib/utils/timezone';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

function isValidPlexMediaType(type: string): type is PlexMediaType {
  return VALID_PLEX_MEDIA_TYPES.includes(type as PlexMediaType);
}

interface PlexWebhookPayload {
  event: string;
  user: boolean;
  owner: boolean;
  Account: {
    id: number;
    thumb: string;
    title: string;
  };
  Server: {
    title: string;
    uuid: string;
  };
  Metadata: {
    librarySectionType: string;
    ratingKey: string;
    key: string;
    guid: string;
    type: string;
    title: string;
    year?: number;
    thumb?: string;
    duration?: number;
    originallyAvailableAt?: string;
    Guid?: Array<{ id: string }>;
    // TV Episode fields
    grandparentTitle?: string; // Show title
    parentIndex?: number; // Season number
    index?: number; // Episode number
  };
}

export const POST: RequestHandler = async ({ url, request }) => {
  const token = url.searchParams.get('token');
  if (!token || token !== process.env.PLEX_WEBHOOK_TOKEN) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const payloadStr = formData.get('payload');

    if (!payloadStr || typeof payloadStr !== 'string') {
      return json({ error: 'Missing payload' }, { status: 400 });
    }

    const payload: PlexWebhookPayload = JSON.parse(payloadStr);
    const metadata = payload.Metadata;

    // Filter by account if configured
    const allowedAccount = process.env.PLEX_ACCOUNT_NAME;
    if (allowedAccount && payload.Account?.title !== allowedAccount) {
      return json({ message: 'Account filtered', account: payload.Account?.title });
    }

    // Only process media.scrobble events (when ~90% watched)
    if (payload.event !== 'media.scrobble') {
      return json({ message: 'Event ignored', event: payload.event });
    }

    // Validate media type
    const mediaType = metadata.type;
    if (!isValidPlexMediaType(mediaType)) {
      return json({ message: 'Media type not supported', type: mediaType });
    }

    // Handle movies
    if (mediaType === 'movie') {
      return handleMovie(metadata);
    }

    // Handle episodes
    if (mediaType === 'episode') {
      return handleEpisode(metadata);
    }

    return json({ message: 'Media type ignored', type: mediaType });
  } catch (err) {
    return json(
      { error: 'Internal Server Error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};

async function handleMovie(metadata: PlexWebhookPayload['Metadata']) {
  const externalId = metadata.ratingKey;

  // Check for duplicates
  const existing = await db
    .select()
    .from(activityTable)
    .where(and(eq(activityTable.type, 'plex'), eq(activityTable.externalId, externalId)))
    .get();

  if (existing) {
    return json({ message: 'Activity already exists', id: existing.id });
  }

  // Fetch OMDB data for IMDB link and poster
  const omdbData = await fetchOmdbByTitle(metadata.title, metadata.year, 'movie');
  let imdbId: string | null = null;
  let imdbUrl: string | null = null;
  let thumbnailUrl: string | null = null;
  let director: string | null = null;

  if (omdbData && omdbData.Response === 'True') {
    imdbId = omdbData.imdbID || null;
    imdbUrl = imdbId ? `https://www.imdb.com/title/${imdbId}/` : null;
    director = omdbData.Director && omdbData.Director !== 'N/A' ? omdbData.Director : null;

    if (omdbData.Poster && omdbData.Poster !== 'N/A') {
      thumbnailUrl = await uploadImageToR2WithHash(omdbData.Poster);
    }
  }

  // Create the activity record
  const [activity] = await db
    .insert(activityTable)
    .values({
      type: 'plex',
      externalId,
      timestamp: Math.floor(Date.now() / 1000),
      isPrivate: false
    })
    .returning();

  // Create the Plex-specific record
  await db.insert(activityPlexTable).values({
    activityId: activity.id,
    title: metadata.title,
    thumbnailUrl,
    mediaType: 'movie',
    imdbId,
    imdbUrl,
    year: metadata.year || null,
    duration: metadata.duration ? Math.floor(metadata.duration / 60000) : null,
    director,
    review: null,
    rating: null
  });

  return json({ success: true, id: activity.id });
}

async function handleEpisode(metadata: PlexWebhookPayload['Metadata']) {
  const now = new Date();
  const timestamp = Math.floor(now.getTime() / 1000);
  const dateString = formatUserDate(now);

  // Extract episode IMDB ID from Plex GUID
  const episodeImdbId = extractImdbIdFromGuids(metadata.Guid);
  if (!episodeImdbId) {
    return json({ message: 'No IMDB ID found for episode' });
  }

  // Fetch episode data from OMDB to get series ID
  const episodeData = await fetchOmdbById(episodeImdbId);
  if (!episodeData || episodeData.Response !== 'True' || !episodeData.seriesID) {
    return json({ message: 'Could not fetch episode data from OMDB', episodeImdbId });
  }

  const seriesImdbId = episodeData.seriesID;

  // Build external ID for merging: show_{seriesImdbId}_{YYYY-MM-DD}
  const externalId = `show_${seriesImdbId}_${dateString}`;

  // Upload episode poster to R2
  let episodePosterUrl: string | null = null;
  if (episodeData.Poster && episodeData.Poster !== 'N/A') {
    episodePosterUrl = await uploadImageToR2WithHash(episodeData.Poster);
  }

  // Create episode entry
  const newEpisode: PlexEpisode = {
    imdbId: episodeImdbId,
    title: episodeData.Title || metadata.title,
    season: metadata.parentIndex || parseInt(episodeData.Season || '0', 10),
    episode: metadata.index || parseInt(episodeData.Episode || '0', 10),
    posterUrl: episodePosterUrl || undefined,
    watchedAt: timestamp
  };

  // Check for existing activity with same external ID (same show, same day)
  const existing = await db
    .select()
    .from(activityTable)
    .innerJoin(activityPlexTable, eq(activityPlexTable.activityId, activityTable.id))
    .where(and(eq(activityTable.type, 'plex'), eq(activityTable.externalId, externalId)))
    .get();

  if (existing) {
    // Merge: add episode to existing activity
    const existingEpisodes = (existing.activity_plex.episodes || []) as PlexEpisode[];

    // Check if this episode already exists (avoid duplicates)
    const alreadyExists = existingEpisodes.some((ep) => ep.imdbId === episodeImdbId);
    if (alreadyExists) {
      return json({ message: 'Episode already exists in activity', activityId: existing.activity.id });
    }

    // Add new episode and update timestamp
    const updatedEpisodes = [...existingEpisodes, newEpisode];

    await db
      .update(activityPlexTable)
      .set({ episodes: updatedEpisodes })
      .where(eq(activityPlexTable.activityId, existing.activity.id));

    await db.update(activityTable).set({ timestamp }).where(eq(activityTable.id, existing.activity.id));

    return json({ success: true, id: existing.activity.id, merged: true, episodeCount: updatedEpisodes.length });
  }

  // New activity: fetch series data for show info
  const seriesData = await fetchOmdbById(seriesImdbId);
  let showTitle = metadata.grandparentTitle || 'Unknown Show';
  let showYear: number | null = null;
  let showPosterUrl: string | null = null;

  if (seriesData && seriesData.Response === 'True') {
    showTitle = seriesData.Title || showTitle;
    showYear = seriesData.Year ? parseInt(seriesData.Year, 10) : null;

    if (seriesData.Poster && seriesData.Poster !== 'N/A') {
      showPosterUrl = await uploadImageToR2WithHash(seriesData.Poster);
    }
  }

  // Create the activity record
  const [activity] = await db
    .insert(activityTable)
    .values({
      type: 'plex',
      externalId,
      timestamp,
      isPrivate: false
    })
    .returning();

  // Create the Plex-specific record for TV show
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

  return json({ success: true, id: activity.id, merged: false });
}
