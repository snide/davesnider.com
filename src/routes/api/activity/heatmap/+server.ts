import { activityTable, type ActivityType } from '$db/schema';
import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

const DAY_MS = 86400000;

// Only the types exposed in the activity page's filter dropdown
const EXPOSED_ACTIVITY_TYPES: ActivityType[] = ['plex', 'github', 'bluesky', 'hackernews', 'steam'];

export const GET: RequestHandler = async ({ url }) => {
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30'), 1), 366);
  // Minutes, as reported by the client's Date.getTimezoneOffset() (UTC minus
  // local time), so day buckets line up with the viewer's calendar.
  const tzOffset = parseInt(url.searchParams.get('tzOffset') || '0') || 0;
  const offsetSeconds = tzOffset * 60;

  const nowLocalMs = Date.now() - tzOffset * 60000;
  const dayList: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dayList.push(new Date(nowLocalMs - i * DAY_MS).toISOString().slice(0, 10));
  }
  const cutoff = Math.floor(Date.parse(`${dayList[0]}T00:00:00Z`) / 1000) + offsetSeconds;

  try {
    const dayExpr = sql`date(${activityTable.timestamp} - ${offsetSeconds}, 'unixepoch')`;

    const grouped = await db
      .select({
        type: activityTable.type,
        day: dayExpr.as('day'),
        count: sql`COUNT(*)`.as('count')
      })
      .from(activityTable)
      .where(and(eq(activityTable.isPrivate, false), gte(activityTable.timestamp, cutoff)))
      .groupBy(activityTable.type, dayExpr);

    const countsByType = new Map<string, Map<string, number>>();
    for (const row of grouped) {
      if (!countsByType.has(row.type)) {
        countsByType.set(row.type, new Map());
      }
      countsByType.get(row.type)!.set(String(row.day), Number(row.count));
    }

    const rows = EXPOSED_ACTIVITY_TYPES.map((type) => ({
      type,
      counts: dayList.map((day) => countsByType.get(type)?.get(day) ?? 0)
    }));

    return json({ days: dayList, rows });
  } catch (error) {
    console.error('Error occurred:', error);
    return json({ message: (error as Error).message }, { status: 500 });
  }
};
