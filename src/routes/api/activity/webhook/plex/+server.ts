import { activityPlexTable, activityTable, VALID_PLEX_MEDIA_TYPES, type PlexMediaType } from '$db/schema';
import { db } from '$lib/server/db';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { json } from '@sveltejs/kit';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const r2 = new S3Client({
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!
  },
  region: 'auto',
  forcePathStyle: true
});

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
  };
}

interface OmdbResponse {
  Response: string;
  imdbID?: string;
  Poster?: string;
  Director?: string;
  Error?: string;
}

async function fetchOmdbData(title: string, year?: number): Promise<OmdbResponse | null> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) {
    console.error('OMDB_API_KEY not configured');
    return null;
  }

  const params = new URLSearchParams({
    apikey: apiKey,
    t: title,
    type: 'movie'
  });

  if (year) {
    params.set('y', year.toString());
  }

  try {
    const response = await fetch(`https://www.omdbapi.com/?${params}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('OMDB API error:', err);
    return null;
  }
}

async function uploadPosterToR2(posterUrl: string): Promise<string | null> {
  try {
    const response = await fetch(posterUrl);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const date = new Date();
    const formattedDate = `${date.getFullYear()}${date.toLocaleString('en', { month: 'short' }).toUpperCase()}/`;
    const randomString = crypto
      .randomBytes(12)
      .toString('base64')
      .replace(/[+=/]/g, (char) => {
        switch (char) {
          case '+':
            return '-';
          case '=':
            return '_';
          case '/':
            return '~';
          default:
            return char;
        }
      });
    const destinationFileName = `activity/plex/${formattedDate}${randomString}.jpg`;

    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: destinationFileName,
        Body: Buffer.from(buffer),
        ContentType: 'image/jpeg'
      })
    );

    return `https://files.davesnider.com/${destinationFileName}`;
  } catch (err) {
    console.error('Error uploading poster to R2:', err);
    return null;
  }
}

export const POST: RequestHandler = async ({ url, request }) => {
  // Validate token
  const token = url.searchParams.get('token');
  if (!token || token !== process.env.PLEX_WEBHOOK_TOKEN) {
    console.log('[Plex] Unauthorized request - invalid token');
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Plex sends webhooks as multipart form data
    const formData = await request.formData();
    const payloadStr = formData.get('payload');

    if (!payloadStr || typeof payloadStr !== 'string') {
      console.log('[Plex] Missing payload in request');
      return json({ error: 'Missing payload' }, { status: 400 });
    }

    const payload: PlexWebhookPayload = JSON.parse(payloadStr);
    const metadata = payload.Metadata;

    console.log(`[Plex] Received: ${payload.event} - "${metadata.title}" (${metadata.type}) from ${payload.Account?.title || 'unknown'}`);

    // Filter by account if configured
    const allowedAccount = process.env.PLEX_ACCOUNT_NAME;
    if (allowedAccount && payload.Account?.title !== allowedAccount) {
      console.log(`[Plex] Ignoring event from account: ${payload.Account?.title}`);
      return json({ message: 'Account filtered', account: payload.Account?.title });
    }

    // Only process media.scrobble events (when ~90% watched)
    if (payload.event !== 'media.scrobble') {
      console.log(`[Plex] Ignoring event: ${payload.event}`);
      return json({ message: 'Event ignored', event: payload.event });
    }

    // Validate and filter media type
    const mediaType = metadata.type;
    if (!isValidPlexMediaType(mediaType)) {
      console.log(`[Plex] Unsupported media type: ${mediaType}`);
      return json({ message: 'Media type not supported', type: mediaType });
    }

    // Only process movies for now
    if (mediaType !== 'movie') {
      console.log(`[Plex] Ignoring media type: ${mediaType}`);
      return json({ message: 'Media type ignored', type: mediaType });
    }

    const externalId = metadata.ratingKey;

    // Check for duplicates
    const existing = await db
      .select()
      .from(activityTable)
      .where(and(eq(activityTable.type, 'plex'), eq(activityTable.externalId, externalId)))
      .get();

    if (existing) {
      console.log(`[Plex] Duplicate: "${metadata.title}" already exists (id: ${existing.id})`);
      return json({ message: 'Activity already exists', id: existing.id });
    }

    // Fetch OMDB data for IMDB link
    console.log(`[Plex] Fetching OMDB data for "${metadata.title}" (${metadata.year || 'no year'})`);
    const omdbData = await fetchOmdbData(metadata.title, metadata.year);
    let imdbId: string | null = null;
    let imdbUrl: string | null = null;
    let thumbnailUrl: string | null = null;
    let director: string | null = null;

    if (omdbData && omdbData.Response === 'True') {
      imdbId = omdbData.imdbID || null;
      imdbUrl = imdbId ? `https://www.imdb.com/title/${imdbId}/` : null;
      director = omdbData.Director && omdbData.Director !== 'N/A' ? omdbData.Director : null;
      console.log(`[Plex] OMDB found: ${imdbId} (dir: ${director || 'unknown'})`);

      // Upload poster to R2
      if (omdbData.Poster && omdbData.Poster !== 'N/A') {
        console.log(`[Plex] Uploading poster to R2...`);
        thumbnailUrl = await uploadPosterToR2(omdbData.Poster);
        if (thumbnailUrl) {
          console.log(`[Plex] Poster uploaded: ${thumbnailUrl}`);
        } else {
          console.log(`[Plex] Poster upload failed`);
        }
      }
    } else {
      console.log(`[Plex] OMDB not found for "${metadata.title}"`);
    }

    // Create the activity record
    const [activity] = await db
      .insert(activityTable)
      .values({
        type: 'plex',
        externalId,
        timestamp: Math.floor(Date.now() / 1000),
        title: metadata.title,
        url: imdbUrl,
        thumbnailUrl,
        isPrivate: false
      })
      .returning();

    // Create the Plex-specific record
    await db.insert(activityPlexTable).values({
      activityId: activity.id,
      mediaType,
      imdbId,
      imdbUrl,
      year: metadata.year || null,
      duration: metadata.duration ? Math.floor(metadata.duration / 60000) : null,
      director,
      review: null,
      rating: null
    });

    console.log(`[Plex] Created activity #${activity.id}: "${metadata.title}"`);
    return json({ success: true, id: activity.id });
  } catch (err) {
    console.error('[Plex] Error processing webhook:', err);
    return json(
      { error: 'Internal Server Error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
