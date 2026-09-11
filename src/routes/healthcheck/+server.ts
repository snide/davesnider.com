import { getDatabaseHealth } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Cheap liveness probe (Fly hits this every 10 s): never touches the database,
// just reports what the DB module knows. /healthcheck/db is the real probe.
export const GET: RequestHandler = async () => {
  const database = getDatabaseHealth();
  return json({
    status: 'ok',
    databaseMode: database.mode,
    database,
    region: process.env.FLY_REGION || 'unknown',
    alloc: process.env.FLY_ALLOC_ID || 'unknown',
    app: process.env.FLY_APP_NAME || 'unknown',
    timestamp: new Date().toISOString()
  });
};
