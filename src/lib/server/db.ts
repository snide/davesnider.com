import { type Client, createClient } from '@libsql/client';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/libsql';
import fs from 'fs';
import { errorMessages } from './errors';
import { isReplicaError, makeResilientClient } from './resilientClient';

config({ path: '.env' });

const isProduction = process.env.ENV_NAME === 'production';
// Fly mounts the replica volume at /app/data; override to run the embedded
// replica anywhere else (e.g. reproducing a prod-only failure locally).
const dataDir = process.env.DB_REPLICA_DIR || '/app/data';
const dbPath = `${dataDir}/turso_local.db`;
const REPLICA_FILES = [
  'turso_local.db',
  'turso_local.db-wal',
  'turso_local.db-shm',
  'turso_local.db-client_wal_index',
  'turso_local.db-info'
];
// Explicit sync probe. The client's own 30 s interval sync only logs its
// failures inside the native layer (2026-09-11: "WAL frame insert conflict"
// every 30 s for hours, invisible to JS) — calling sync() ourselves surfaces
// them as errors we can act on.
const SYNC_WATCHDOG_MS = 60_000;

type DatabaseMode = 'unknown' | 'local-with-sync' | 'remote-only-fallback' | 'remote-dev';

export type DatabaseHealth = {
  mode: DatabaseMode;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  rebuilds: number;
  lastRebuildAt: string | null;
  lastRebuildError: string | null;
};

const health: DatabaseHealth = {
  mode: 'unknown',
  lastSyncAt: null,
  lastSyncError: null,
  rebuilds: 0,
  lastRebuildAt: null,
  lastRebuildError: null
};

const createRemoteClient = (): Client =>
  createClient({
    url: process.env.TURSO_DB_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!
  });

const createReplicaClient = (): Client =>
  createClient({
    url: `file:${dbPath}`,
    syncUrl: process.env.TURSO_DB_URL!,
    syncInterval: 30,
    authToken: process.env.TURSO_AUTH_TOKEN!
  });

const clearReplicaFiles = () => {
  for (const file of REPLICA_FILES) {
    const filePath = `${dataDir}/${file}`;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Removed existing ${file}`);
    }
  }
};

// Fresh replica: wipe the files and do a full sync from the primary (~1 s for
// the ~100 MB database as of 2026-09).
const syncFreshReplica = async (): Promise<Client> => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`Created ${dataDir} directory`);
  }
  console.log(`📂 ${dataDir} contents before sync:`, fs.readdirSync(dataDir));
  const client = createReplicaClient();
  console.log('⏳ Starting initial database sync...');
  await client.sync();
  console.log('✅ Initial database sync completed');
  console.log(`📂 ${dataDir} contents after sync:`, fs.readdirSync(dataDir));
  if (fs.existsSync(dbPath)) {
    const stats = fs.statSync(dbPath);
    console.log(`📊 Local replica size: ${(stats.size / 1024).toFixed(2)} KB`);
  }
  health.lastSyncAt = new Date().toISOString();
  health.lastSyncError = null;
  return client;
};

// Rebuild strategy for the resilient client: close the broken replica, wipe
// it, re-sync. If even that fails (primary unreachable), serve from the remote
// so reads keep working; the next boot tries the replica again.
const rebuildReplica = async (current: Client): Promise<Client> => {
  health.rebuilds += 1;
  console.error(`🚨 Rebuilding embedded replica (rebuild #${health.rebuilds})`);
  try {
    current.close();
  } catch (error) {
    console.warn('Could not close the previous client:', errorMessages(error).join(' ← '));
  }
  try {
    clearReplicaFiles();
    const client = await syncFreshReplica();
    health.mode = 'local-with-sync';
    health.lastRebuildAt = new Date().toISOString();
    health.lastRebuildError = null;
    console.log('✅ Embedded replica rebuilt');
    return client;
  } catch (error) {
    health.lastRebuildError = errorMessages(error).join(' ← ');
    health.mode = 'remote-only-fallback';
    console.error('❌ Replica rebuild failed, falling back to remote only:', health.lastRebuildError);
    return createRemoteClient();
  }
};

const initializeDatabase = async (): Promise<Client> => {
  if (!isProduction) {
    health.mode = 'remote-dev';
    console.log('🧪 DATABASE MODE: Using remote database (development)');
    return createRemoteClient();
  }

  try {
    // Optionally clear replica files for a fresh sync (useful after migrations)
    if (process.env.FORCE_FRESH_SYNC === 'true') {
      console.log('🔄 FORCE_FRESH_SYNC enabled, clearing replica files...');
      if (fs.existsSync(dataDir)) clearReplicaFiles();
    }
    const client = await syncFreshReplica();
    health.mode = 'local-with-sync';
    console.log('🔄 DATABASE MODE: Using local database replica with sync');
    return client;
  } catch (error) {
    console.warn('⚠️ Could not initialize local DB replica, falling back to remote only:', error);
    health.mode = 'remote-only-fallback';
    console.log('☁️ DATABASE MODE: Using remote database (fallback)');
    return createRemoteClient();
  }
};

// Initialize database with top-level await
const resilient = makeResilientClient(await initializeDatabase(), {
  rebuild: isProduction ? rebuildReplica : undefined
});

// Watchdog: probe the sync every minute while on the replica. A replica-class
// failure triggers a rebuild before a reader ever sees it.
let syncing = false;
const syncWatchdog = async () => {
  if (health.mode !== 'local-with-sync' || syncing) return;
  syncing = true;
  try {
    await resilient.client.sync();
    health.lastSyncAt = new Date().toISOString();
    health.lastSyncError = null;
  } catch (error) {
    health.lastSyncError = errorMessages(error).join(' ← ');
    console.error('⚠️ Replica sync failed:', health.lastSyncError);
    if (isReplicaError(error)) {
      try {
        await resilient.rebuild();
      } catch (rebuildError) {
        console.error('❌ Replica rebuild threw:', errorMessages(rebuildError).join(' ← '));
      }
    }
  } finally {
    syncing = false;
  }
};
if (isProduction) setInterval(syncWatchdog, SYNC_WATCHDOG_MS).unref();

// Export database mode / health for the healthcheck routes
export const getDatabaseMode = () => health.mode;
export const getDatabaseHealth = (): DatabaseHealth => ({ ...health });

export const db = drizzle(resilient.client, { casing: 'snake_case' });
