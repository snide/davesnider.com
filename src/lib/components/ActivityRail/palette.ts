// Fixed monochrome palette for the activity ribbon.
//
// Segments stack in RAIL_TYPE_ORDER; a new activity type appends to the END
// of the order (never reshuffle existing assignments) with a mono level that
// keeps a wide lightness gap to its new neighbor.

import type { ActivityType } from '$db/schema';

export const RAIL_TYPE_ORDER: ActivityType[] = [
  'steam',
  'reddit',
  'bluesky',
  'bgg',
  'github',
  'hackernews',
  'plex',
  'link'
];

// Per-type grayscale levels expressed as "% of --fg mixed into --bg", so they
// track the theme automatically. Values are interleaved so every adjacent
// pair in RAIL_TYPE_ORDER differs by ≥30 points — with the 1px segment gaps
// that keeps neighbors separable without hue.
export const RAIL_MONO_MIX: Record<ActivityType, number> = {
  steam: 85,
  reddit: 35,
  bluesky: 65,
  bgg: 25,
  github: 75,
  hackernews: 45,
  plex: 90,
  link: 55
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
