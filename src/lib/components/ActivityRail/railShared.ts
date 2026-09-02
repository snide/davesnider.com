// Helpers for the activity ribbon rail.

import type { ActivityType } from '$db/schema';
import type { DayComposition } from './palette';

export const RAIL_GRID_CELLS = 8;

export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatMonth(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
}

// ISO dates compare correctly as strings
export function isOutsideDateFilter(day: string, startDate: string | null, endDate: string | null): boolean {
  if (startDate && day < startDate) return true;
  if (endDate && day > endDate) return true;
  return false;
}

export function typeNoun(type: string, count: number): string {
  const noun =
    type === 'plex' || type === 'steam' || type === 'bgg'
      ? 'play'
      : type === 'github'
        ? 'update'
        : type === 'link'
          ? 'link'
          : type === 'flight'
            ? 'flight'
            : 'post';
  return count === 1 ? noun : `${noun}s`;
}

export type RailSegment = { type: ActivityType; count: number; cells: number };

// Quantize a day's composition onto a fixed cell grid so rows read as chunky
// terminal blocks: every present type gets at least one cell, then overflow is
// trimmed from the largest segment until the row fits.
export function quantizeSegments(comp: DayComposition, grid = RAIL_GRID_CELLS): RailSegment[] {
  if (comp.total === 0) return [];
  const segments: RailSegment[] = comp.counts
    .filter((c) => c.count > 0)
    .map((c) => ({ type: c.type, count: c.count, cells: Math.max(1, Math.round((c.count / comp.total) * grid)) }));
  let overflow = segments.reduce((sum, seg) => sum + seg.cells, 0) - grid;
  while (overflow > 0) {
    const largest = segments.reduce((a, b) => (b.cells > a.cells ? b : a));
    if (largest.cells <= 1) break;
    largest.cells -= 1;
    overflow -= 1;
  }
  return segments;
}
