import { activityFlightTable, activityTable, type FlightChannels, type FlightTrackPoint } from '$db/schema';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// Flights are pushed directly by the flight-recorder process on the sim PC
// (no Cloudflare worker in between — the PC is the producer).

// A simplified track should be a few hundred points; anything bigger is a
// client bug, and we don't want multi-MB JSON blobs in the row.
const MAX_TRACK_POINTS = 5000;
const MAX_CHANNEL_POINTS = 500;
const CHANNEL_KEYS = ['t', 'ias', 'gs', 'windKt', 'windDir', 'inCloud'] as const;
const OPTIONAL_CHANNEL_KEYS = ['rpm', 'fuelFlow', 'fuel'] as const;

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.ACTIVITY_INGEST_TOKEN;
  return Boolean(expectedToken) && authHeader === `Bearer ${expectedToken}`;
}

interface FlightItem {
  externalId: string; // departure unix ts as a string (unique per flight)
  timestamp: number; // arrival unix ts (feed position)
  originIcao: string;
  originName?: string;
  destIcao: string;
  destName?: string;
  aircraftTitle?: string;
  aircraftIcao?: string;
  departureTs: number;
  arrivalTs: number;
  durationSec: number;
  distanceNm?: number;
  maxAltitudeFt?: number;
  landingRateFpm?: number;
  routeString?: string;
  track?: FlightTrackPoint[];
  channels?: FlightChannels;
  fuelBurnedGal?: number;
  maxG?: number;
  avgHeadwindKt?: number;
}

interface IngestPayload {
  items: FlightItem[];
}

function validate(item: FlightItem): string | null {
  if (!item.externalId) return 'missing externalId';
  if (!item.originIcao || !item.destIcao) return 'missing origin/dest ICAO';
  if (!Number.isFinite(item.timestamp)) return 'missing timestamp';
  if (!Number.isFinite(item.departureTs) || !Number.isFinite(item.arrivalTs)) {
    return 'missing departure/arrival timestamps';
  }
  if (!Number.isFinite(item.durationSec) || item.durationSec <= 0) return 'invalid durationSec';
  if (item.track) {
    if (!Array.isArray(item.track)) return 'track is not an array';
    if (item.track.length > MAX_TRACK_POINTS) return `track exceeds ${MAX_TRACK_POINTS} points`;
    if (item.track.some((p) => !Array.isArray(p) || p.length !== 4 || p.some((n) => !Number.isFinite(n)))) {
      return 'track contains malformed points';
    }
  }
  if (item.channels != null) {
    const ch = item.channels;
    if (typeof ch !== 'object') return 'channels is not an object';
    for (const key of [...CHANNEL_KEYS, ...OPTIONAL_CHANNEL_KEYS]) {
      const series = ch[key];
      if (series == null && (OPTIONAL_CHANNEL_KEYS as readonly string[]).includes(key)) continue;
      if (!Array.isArray(series) || series.some((n) => !Number.isFinite(n))) {
        return `channels.${key} is malformed`;
      }
      if (series.length !== ch.t.length) return 'channels arrays have mismatched lengths';
      if (series.length > MAX_CHANNEL_POINTS) return `channels exceed ${MAX_CHANNEL_POINTS} points`;
    }
  }
  return null;
}

export const POST: RequestHandler = async ({ request }) => {
  if (!process.env.ACTIVITY_INGEST_TOKEN) {
    return json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (!isAuthorized(request)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload: IngestPayload = await request.json();
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      errors: [] as string[]
    };

    for (const item of payload.items ?? []) {
      try {
        const problem = validate(item);
        if (problem) {
          results.errors.push(`Invalid item ${item.externalId ?? '?'}: ${problem}`);
          continue;
        }

        // A flight is immutable once recorded; the recorder retries on network
        // failures, so duplicates just skip.
        const existing = await db
          .select({ id: activityTable.id })
          .from(activityTable)
          .where(and(eq(activityTable.type, 'flight'), eq(activityTable.externalId, item.externalId)))
          .get();

        if (existing) {
          results.skipped++;
          continue;
        }

        // Insert activity + detail together so a detail failure can't leave an
        // orphaned activity row.
        await db.transaction(async (tx) => {
          const [activity] = await tx
            .insert(activityTable)
            .values({
              type: 'flight',
              externalId: item.externalId,
              timestamp: item.timestamp,
              isPrivate: false,
              isThreadRoot: true,
              threadLatestTimestamp: item.timestamp
            })
            .returning();

          await tx.insert(activityFlightTable).values({
            activityId: activity.id,
            title: `${item.originIcao} → ${item.destIcao}`,
            originIcao: item.originIcao,
            originName: item.originName || null,
            destIcao: item.destIcao,
            destName: item.destName || null,
            aircraftTitle: item.aircraftTitle || null,
            aircraftIcao: item.aircraftIcao || null,
            departureTs: item.departureTs,
            arrivalTs: item.arrivalTs,
            durationSec: item.durationSec,
            distanceNm: item.distanceNm ?? null,
            maxAltitudeFt: item.maxAltitudeFt ?? null,
            landingRateFpm: item.landingRateFpm ?? null,
            routeString: item.routeString || null,
            track: item.track ?? null,
            channels: item.channels ?? null,
            fuelBurnedGal: item.fuelBurnedGal ?? null,
            maxG: item.maxG ?? null,
            avgHeadwindKt: item.avgHeadwindKt ?? null
          });
        });

        results.created++;
      } catch (err) {
        results.errors.push(
          `Failed to process item ${item.externalId}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }

    return json({ success: true, results });
  } catch (err) {
    return json(
      { error: 'Internal Server Error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
