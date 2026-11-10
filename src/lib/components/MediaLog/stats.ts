import { USER_TIMEZONE } from '#lib/utils/timezone.js';
import type { MediaLogItem } from './types.js';

// A chart bucket. `key` is what a filter matches against (see bucketKeys).
export type Bucket = { key: string; label: string; count: number };

export type MediaLogFilter = {
  dimension: 'weekday' | 'month' | 'score' | 'decade' | 'creator';
  key: string;
  label: string;
};

export type MediaLogStats = {
  total: number;
  lastYear: number; // consumed in the 365 days before `nowSec`
  reviewed: number;
  rated: number;
  averageScore: number | null;
  topWeekday: Bucket | null;
  weekdays: Bucket[];
  months: Bucket[];
  scores: Bucket[];
  decades: Bucket[];
  creators: Bucket[];
};

// A film that ends at 12:30am belongs to the evening it started, so the
// calendar day rolls over at 4am rather than midnight.
const DAY_ROLLOVER_SEC = 4 * 3600;
const MAX_MONTHS = 24;
const MAX_CREATORS = 10;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Always bucketed in the site owner's timezone: the day-of-week chart must
// not change with the viewer's locale.
const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: USER_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  weekday: 'short'
});

type DayParts = { weekday: string; month: string };

function dayParts(timestamp: number): DayParts {
  const parts = partsFormat.formatToParts(new Date((timestamp - DAY_ROLLOVER_SEC) * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { weekday: get('weekday'), month: `${get('year')}-${get('month').padStart(2, '0')}` };
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]} ${year}`;
}

function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

// The bucket keys an item falls into, per dimension. Shared by the stats
// and the grid filter so a clicked bar always selects exactly what it counted.
export function bucketKeys(item: MediaLogItem): Record<MediaLogFilter['dimension'], string[]> {
  const { weekday, month } = dayParts(item.timestamp);
  return {
    weekday: [weekday],
    month: [month],
    score: item.rating ? [String(item.rating)] : [],
    decade: item.year ? [String(decadeOf(item.year))] : [],
    creator: item.creators
  };
}

export function matchesFilter(item: MediaLogItem, filter: MediaLogFilter): boolean {
  return bucketKeys(item)[filter.dimension].includes(filter.key);
}

export function computeStats(items: MediaLogItem[], nowSec: number): MediaLogStats {
  const weekdayCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  const scoreCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  // Count plus latest watch, so ties rank the more recently watched first
  const creatorCounts = new Map<string, { count: number; latest: number }>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

  let lastYear = 0;
  let reviewed = 0;
  let rated = 0;
  let scoreSum = 0;

  for (const item of items) {
    const keys = bucketKeys(item);
    keys.weekday.forEach((k) => bump(weekdayCounts, k));
    keys.month.forEach((k) => bump(monthCounts, k));
    keys.score.forEach((k) => bump(scoreCounts, k));
    keys.decade.forEach((k) => bump(decadeCounts, k));
    for (const name of keys.creator) {
      const prev = creatorCounts.get(name);
      creatorCounts.set(name, {
        count: (prev?.count ?? 0) + 1,
        latest: Math.max(prev?.latest ?? 0, item.timestamp)
      });
    }
    if (item.timestamp >= nowSec - 365 * 86400) lastYear++;
    if (item.review) reviewed++;
    if (item.rating) {
      rated++;
      scoreSum += item.rating;
    }
  }

  const weekdays = WEEKDAYS.map((day) => ({ key: day, label: day, count: weekdayCounts.get(day) ?? 0 }));

  // Every month from the first watch to the latest, gaps included, capped to
  // the most recent MAX_MONTHS so the bars stay readable as the log grows.
  const months: Bucket[] = [];
  const monthKeys = [...monthCounts.keys()].sort();
  if (monthKeys.length > 0) {
    let [year, month] = monthKeys[0].split('-').map(Number);
    const last = monthKeys[monthKeys.length - 1];
    for (;;) {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      months.push({ key, label: monthLabel(key), count: monthCounts.get(key) ?? 0 });
      if (key >= last) break;
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
  }

  const scores = [1, 2, 3, 4, 5].map((score) => ({
    key: String(score),
    label: `${score}★`,
    count: scoreCounts.get(String(score)) ?? 0
  }));

  const decades: Bucket[] = [];
  const decadeKeys = [...decadeCounts.keys()].map(Number);
  if (decadeKeys.length > 0) {
    for (let d = Math.min(...decadeKeys); d <= Math.max(...decadeKeys); d += 10) {
      decades.push({ key: String(d), label: `${d}s`, count: decadeCounts.get(String(d)) ?? 0 });
    }
  }

  const creators = [...creatorCounts.entries()]
    .sort(([, a], [, b]) => b.count - a.count || b.latest - a.latest)
    .slice(0, MAX_CREATORS)
    .map(([name, { count }]) => ({ key: name, label: name, count }));

  const topWeekday = weekdays.reduce<Bucket | null>((top, day) => (day.count > (top?.count ?? 0) ? day : top), null);

  return {
    total: items.length,
    lastYear,
    reviewed,
    rated,
    averageScore: rated > 0 ? scoreSum / rated : null,
    topWeekday,
    weekdays,
    months: months.slice(-MAX_MONTHS),
    scores,
    decades,
    creators
  };
}

export type MediaLogSort = 'date' | 'year' | 'score';

// Newest / highest first. Items missing the sort field go last; ties fall
// back to the consumed date.
export function sortItems(items: MediaLogItem[], sort: MediaLogSort): MediaLogItem[] {
  const field = (item: MediaLogItem): number =>
    sort === 'date' ? item.timestamp : ((sort === 'year' ? item.year : item.rating) ?? -Infinity);
  return [...items].sort((a, b) => field(b) - field(a) || b.timestamp - a.timestamp);
}

export function searchItems(items: MediaLogItem[], term: string): MediaLogItem[] {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((item) => {
    const haystack = [item.title, item.creators.join(' '), item.year ?? '', item.review ?? ''].join(' ').toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
