import { activityFlightTable } from '$db/schema';
import { db, getDatabaseHealth } from '$lib/server/db';
import { errorMessages } from '$lib/server/errors';
import { json } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';

// Read probe that goes through the resilient client, shaped like the query
// that failed on 2026-09-11 (several wide flight rows in one statement —
// single-row reads still worked on the broken replica). 503 only when the
// self-healing path could not recover. Throttled: it is public and the
// replica is shared, so a flood must not turn into a flood of reads.
const THROTTLE_MS = 15_000;
let lastProbe: { at: number; status: number; body: Record<string, unknown> } | null = null;

const runProbe = async () => {
  const started = Date.now();
  const rows = await db
    .select({ id: activityFlightTable.id })
    .from(activityFlightTable)
    .orderBy(desc(activityFlightTable.id))
    .limit(5);
  return { rowsRead: rows.length, durationMs: Date.now() - started };
};

export const GET: RequestHandler = async () => {
  const now = Date.now();
  if (lastProbe && now - lastProbe.at < THROTTLE_MS) {
    return json({ ...lastProbe.body, cached: true }, { status: lastProbe.status });
  }
  let status = 200;
  let body: Record<string, unknown>;
  try {
    const probe = await runProbe();
    body = { status: 'ok', probe, database: getDatabaseHealth(), timestamp: new Date().toISOString() };
  } catch (error) {
    status = 503;
    body = {
      status: 'error',
      error: errorMessages(error),
      database: getDatabaseHealth(),
      timestamp: new Date().toISOString()
    };
    console.error('❌ /healthcheck/db failed:', errorMessages(error).join(' ← '));
  }
  lastProbe = { at: now, status, body };
  return json(body, { status });
};
