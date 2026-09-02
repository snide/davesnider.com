// Fixed monochrome palette for the activity ribbon.
//
// Segments stack alphabetically and the grayscale ramp is monotonic along
// that order, so every row reads as the same light→dark progression — a
// coherent wave rather than interleaved noise. Type identity comes from the
// tooltip, not from decoding shades. A new activity type slots into its
// alphabetical position and the ramp gets re-spread evenly.

import type { ActivityType } from '$db/schema';

export const RAIL_TYPE_ORDER: ActivityType[] = [
  'bgg',
  'bluesky',
  'flight',
  'github',
  'hackernews',
  'link',
  'plex',
  'reddit',
  'steam'
];

// Per-type grayscale levels expressed as "% of --fg mixed into --bg", so they
// track the theme automatically. Evenly stepped 25→95 in RAIL_TYPE_ORDER.
export const RAIL_MONO_MIX: Record<ActivityType, number> = {
  bgg: 25,
  bluesky: 34,
  flight: 43,
  github: 51,
  hackernews: 60,
  link: 69,
  plex: 78,
  reddit: 86,
  steam: 95
};

export type DayComposition = {
  day: string;
  total: number;
  // Per-type counts in RAIL_TYPE_ORDER, zeros included
  counts: { type: ActivityType; count: number }[];
};

// Reshape the /api/activity/heatmap response ({days, rows: [{type, counts}]})
// into per-day compositions ordered by RAIL_TYPE_ORDER.
export function toCompositions(days: string[], rows: { type: string; counts: number[] }[]): DayComposition[] {
  const byType = new Map(rows.map((row) => [row.type, row.counts]));
  return days.map((day, i) => {
    const counts = RAIL_TYPE_ORDER.map((type) => ({
      type,
      count: byType.get(type)?.[i] ?? 0
    }));
    return { day, total: counts.reduce((sum, c) => sum + c.count, 0), counts };
  });
}
