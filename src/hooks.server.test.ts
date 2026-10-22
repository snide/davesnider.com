import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleError } from './hooks.server';

const event = (path: string) =>
  ({ request: new Request(`http://localhost${path}`), url: new URL(`http://localhost${path}`) }) as never;

describe('handleError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the route, the outer message and every cause beneath it', () => {
    const logged: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line) => logged.push(String(line)));
    const libsql = new Error('database disk image is malformed');
    const drizzle = new Error('Failed query: select "id" from "activity_flight"', { cause: libsql });

    const result = handleError({ kind: 'unknown', error: drizzle, event: event('/activity?type=flight') } as never);

    expect(result).toBeUndefined();
    expect(logged[0]).toBe('[500] GET /activity?type=flight: Failed query: select "id" from "activity_flight"');
    expect(logged[1]).toBe('  ↳ cause: database disk image is malformed');
    expect(logged[2]).toContain('Failed query'); // the stack
  });

  it('keeps 404s to a single warn line', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleError({ kind: 'framework', error: { status: 404, message: 'Not Found' }, event: event('/nope') } as never);
    expect(warn).toHaveBeenCalledWith('[404] GET /nope');
    expect(error).not.toHaveBeenCalled();
  });

  it('keeps expected 4xx app errors to a single warn line with the message', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleError({ kind: 'app', error: { status: 401, message: 'Unauthorized' }, event: event('/api/x') } as never);
    expect(warn).toHaveBeenCalledWith('[401] GET /api/x: Unauthorized');
    expect(error).not.toHaveBeenCalled();
  });
});
