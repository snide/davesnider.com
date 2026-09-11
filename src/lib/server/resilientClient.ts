import type { Client } from '@libsql/client';
import { errorMatches } from './errors';

// Two failure classes the embedded replica (Fly volume + Turso primary) hits
// that @libsql/client 0.17 does not heal on its own:
//
// 1. Hrana stream errors. Writes are forwarded to the primary over a long-lived
//    stream that the server drops on restart/upgrade; every later write fails
//    until the process restarts. `reconnect()` re-opens the handle in place,
//    keeping the local file. (libsql#2083, #1856; ported from tableslayer.)
const STREAM_ERRORS = /stream not found|stream (has )?expired|STREAM_EXPIRED|HRANA_CLOSED|invalid baton/i;

// 2. A replica that can no longer follow the primary. 2026-09-11: the sync
//    loop logged "insert error (frame=1): WalConflict / WAL frame insert
//    conflict" every 30 s and multi-row reads 500'd while single rows still
//    worked. Only a rebuild — wipe the files and re-sync from scratch — fixes
//    it; reconnect() would reopen the same broken file.
const REPLICA_ERRORS =
  /WAL frame insert conflict|WalConflict|wal_insert|database disk image is malformed|SQLITE_CORRUPT|SQLITE_NOTADB|file is not a database/i;

export const isStreamError = (error: unknown): boolean => errorMatches(error, STREAM_ERRORS);
export const isReplicaError = (error: unknown): boolean => errorMatches(error, REPLICA_ERRORS);

// `reconnect()` exists on the concrete sqlite3/http/ws clients but not on the exported Client type.
type Reconnectable = { reconnect: () => Promise<void> };

export type ResilientClientOptions = {
  // Return a fresh client to use from now on (wipe + re-sync, or a remote
  // fallback). Receives the client being replaced so it can be closed.
  rebuild?: (current: Client) => Promise<Client>;
};

export type ResilientClient = {
  // Hand this to drizzle. It always forwards to the live underlying client.
  client: Client;
  // Force a rebuild (single-flight); the sync watchdog calls this.
  rebuild: () => Promise<void>;
  // The live underlying client (for diagnostics/tests).
  readonly current: Client;
};

// Wraps a libsql client so `execute`/`batch` self-heal: a stream error
// reconnects the client in place and retries once; a replica error rebuilds
// the client via `options.rebuild` and retries once. Anything else surfaces
// unchanged. Transactions are deliberately not retried — a statement that died
// mid-transaction cannot be safely replayed.
export const makeResilientClient = (initial: Client, options: ResilientClientOptions = {}): ResilientClient => {
  let current = initial;
  let reconnecting: Promise<void> | null = null;
  let rebuilding: Promise<void> | null = null;

  // Single-flight: a storm of concurrent failures shares one recovery.
  const reconnect = (): Promise<void> =>
    (reconnecting ??= (current as unknown as Reconnectable).reconnect().finally(() => {
      reconnecting = null;
    }));

  const rebuild = (): Promise<void> => {
    if (!options.rebuild) return Promise.reject(new Error('No rebuild strategy configured'));
    return (rebuilding ??= options
      .rebuild(current)
      .then((next) => {
        current = next;
      })
      .finally(() => {
        rebuilding = null;
      }));
  };

  const recover = async (error: unknown): Promise<boolean> => {
    if (isStreamError(error)) {
      console.warn('⚠️ libsql stream error; reconnecting client and retrying once', error);
      await reconnect();
      return true;
    }
    if (options.rebuild && isReplicaError(error)) {
      console.error('🚨 libsql replica error; rebuilding replica and retrying once', error);
      await rebuild();
      return true;
    }
    return false;
  };

  const client = new Proxy(initial, {
    get(_target, prop) {
      const value = Reflect.get(current, prop, current);
      if (typeof value !== 'function') return value;

      // Bind to the live client so its private fields resolve through the Proxy.
      if (prop !== 'execute' && prop !== 'batch') {
        return (...args: unknown[]) => (value as (...a: unknown[]) => unknown).apply(current, args);
      }

      return async (...args: unknown[]): Promise<unknown> => {
        // Never run a statement against a replica that is mid-rebuild.
        if (rebuilding) await rebuilding;
        const run = () =>
          (Reflect.get(current, prop, current) as (...a: unknown[]) => Promise<unknown>).apply(current, args);
        try {
          return await run();
        } catch (error) {
          if (!(await recover(error))) throw error;
          return await run(); // retry once; if it fails again, surface it
        }
      };
    }
  });

  return {
    client,
    rebuild,
    get current() {
      return current;
    }
  };
};
