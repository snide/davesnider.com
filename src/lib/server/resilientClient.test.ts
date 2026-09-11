import type { Client } from '@libsql/client';
import { describe, expect, it, vi } from 'vitest';
import { errorMessages } from './errors';
import { isReplicaError, isStreamError, makeResilientClient } from './resilientClient';

const streamError = () =>
  new Error('Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: 2c4be4b6:a2a9\\"}"))');
const replicaError = () => new Error('Error syncing database: WAL frame insert conflict');
const wrapped = (cause: Error) => new Error('Failed query: select * from "activity_flight"', { cause });

describe('errorMessages', () => {
  it('walks the cause chain outermost first', () => {
    expect(errorMessages(wrapped(replicaError()))).toEqual([
      'Failed query: select * from "activity_flight"',
      'Error syncing database: WAL frame insert conflict'
    ]);
  });

  it('handles non-Error values and circular chains', () => {
    expect(errorMessages('boom')).toEqual(['boom']);
    expect(errorMessages(undefined)).toEqual([]);
    const a = new Error('loop') as Error & { cause?: unknown };
    a.cause = a;
    expect(errorMessages(a)).toEqual(['loop']);
  });
});

describe('isStreamError / isReplicaError', () => {
  it('matches each recoverable stream-error variant', () => {
    for (const m of [
      'stream not found: abc',
      'STREAM_EXPIRED',
      'stream has expired',
      'HRANA_CLOSED',
      'invalid baton'
    ]) {
      expect(isStreamError(new Error(m))).toBe(true);
      expect(isReplicaError(new Error(m))).toBe(false);
    }
  });

  it('matches replica failures, including through a Drizzle wrapper', () => {
    for (const m of [
      'WAL frame insert conflict',
      'insert error (frame=1) : WalConflict',
      'database disk image is malformed',
      'SQLITE_CORRUPT: database disk image is malformed',
      'file is not a database'
    ]) {
      expect(isReplicaError(new Error(m))).toBe(true);
      expect(isReplicaError(wrapped(new Error(m)))).toBe(true);
      expect(isStreamError(new Error(m))).toBe(false);
    }
  });

  it('ignores unrelated errors', () => {
    for (const m of ['SQLITE_BUSY: database is locked', 'UNIQUE constraint failed', 'near "selct": syntax error']) {
      expect(isStreamError(new Error(m))).toBe(false);
      expect(isReplicaError(new Error(m))).toBe(false);
    }
    expect(isStreamError(undefined)).toBe(false);
  });
});

type Fake = Client & { execute: ReturnType<typeof vi.fn>; reconnect: ReturnType<typeof vi.fn> };

const makeFakeClient = (execute: (...args: unknown[]) => Promise<unknown>): Fake => {
  const reconnect = vi.fn(async () => {});
  return { execute: vi.fn(execute), batch: vi.fn(execute), reconnect, close: vi.fn() } as unknown as Fake;
};

describe('makeResilientClient — stream errors', () => {
  it('reconnects once and retries, then returns the result', async () => {
    let calls = 0;
    const fake = makeFakeClient(async () => {
      calls += 1;
      if (calls === 1) throw streamError();
      return { rows: ['ok'] };
    });
    const { client } = makeResilientClient(fake);
    await expect(client.execute('delete from "session"')).resolves.toEqual({ rows: ['ok'] });
    expect(fake.execute).toHaveBeenCalledTimes(2);
    expect(fake.reconnect).toHaveBeenCalledTimes(1);
  });

  it('rethrows a non-stream error without reconnecting', async () => {
    const fake = makeFakeClient(async () => {
      throw new Error('UNIQUE constraint failed');
    });
    const { client } = makeResilientClient(fake);
    await expect(client.execute('insert …')).rejects.toThrow('UNIQUE constraint failed');
    expect(fake.reconnect).not.toHaveBeenCalled();
  });

  it('surfaces the error after a single retry', async () => {
    const fake = makeFakeClient(async () => {
      throw streamError();
    });
    const { client } = makeResilientClient(fake);
    await expect(client.execute('delete …')).rejects.toThrow(/stream not found/);
    expect(fake.execute).toHaveBeenCalledTimes(2);
    expect(fake.reconnect).toHaveBeenCalledTimes(1);
  });

  it('single-flights the reconnect across concurrent failures', async () => {
    let first = 0;
    const fake = makeFakeClient(async () => {
      first += 1;
      if (first <= 5) throw streamError();
      return { rows: [] };
    });
    const { client } = makeResilientClient(fake);
    await Promise.all(Array.from({ length: 5 }, () => client.execute('delete …')));
    expect(fake.reconnect).toHaveBeenCalledTimes(1);
  });
});

describe('makeResilientClient — replica errors', () => {
  it('rebuilds via the strategy, swaps to the new client and retries there', async () => {
    const broken = makeFakeClient(async () => {
      throw wrapped(replicaError());
    });
    const healthy = makeFakeClient(async () => ({ rows: ['fresh'] }));
    const rebuild = vi.fn(async (current: Client) => {
      expect(current).toBe(broken);
      return healthy as Client;
    });

    const resilient = makeResilientClient(broken, { rebuild });
    await expect(resilient.client.execute('select …')).resolves.toEqual({ rows: ['fresh'] });
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(broken.execute).toHaveBeenCalledTimes(1);
    expect(healthy.execute).toHaveBeenCalledTimes(1);
    expect(broken.reconnect).not.toHaveBeenCalled();
    expect(resilient.current).toBe(healthy);
    // Later calls go straight to the new client.
    await resilient.client.execute('select …');
    expect(healthy.execute).toHaveBeenCalledTimes(2);
  });

  it('surfaces a replica error unchanged when no rebuild strategy is configured', async () => {
    const broken = makeFakeClient(async () => {
      throw replicaError();
    });
    const { client } = makeResilientClient(broken);
    await expect(client.execute('select …')).rejects.toThrow(/WAL frame insert conflict/);
    expect(broken.execute).toHaveBeenCalledTimes(1);
  });

  it('holds statements while a rebuild is in flight and single-flights it', async () => {
    let releaseRebuild: (c: Client) => void = () => {};
    const healthy = makeFakeClient(async () => ({ rows: ['fresh'] }));
    const rebuild = vi.fn(() => new Promise<Client>((resolve) => (releaseRebuild = resolve)));
    const broken = makeFakeClient(async () => {
      throw replicaError();
    });

    const resilient = makeResilientClient(broken, { rebuild });
    const first = resilient.client.execute('select 1'); // triggers the rebuild
    await Promise.resolve();
    const second = resilient.client.execute('select 2'); // must wait, not hit `broken`
    const manual = resilient.rebuild(); // shares the in-flight rebuild

    releaseRebuild(healthy as Client);
    await Promise.all([first, second, manual]);

    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(broken.execute).toHaveBeenCalledTimes(1);
    expect(healthy.execute).toHaveBeenCalledTimes(2);
  });

  it('forwards non-statement methods (sync, close) to the live client', async () => {
    const healthy = { ...makeFakeClient(async () => ({ rows: [] })), sync: vi.fn(async () => ({ frames_synced: 0 })) };
    const resilient = makeResilientClient(healthy as unknown as Client);
    await (resilient.client as unknown as { sync: () => Promise<unknown> }).sync();
    expect(healthy.sync).toHaveBeenCalledTimes(1);
  });
});
