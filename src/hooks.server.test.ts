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

    const result = handleError({
      error: drizzle,
      event: event('/activity?type=flight'),
      status: 500,
      message: 'Internal Error'
    } as never);

    expect(result).toEqual({ message: 'Internal Error' });
    expect(logged[0]).toBe('[500] GET /activity?type=flight: Failed query: select "id" from "activity_flight"');
    expect(logged[1]).toBe('  ↳ cause: database disk image is malformed');
    expect(logged[2]).toContain('Failed query'); // the stack
  });

  it('keeps 404s to a single warn line', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    handleError({ error: new Error('Not found'), event: event('/nope'), status: 404, message: 'Not Found' } as never);
    expect(warn).toHaveBeenCalledWith('[404] GET /nope');
    expect(error).not.toHaveBeenCalled();
  });
});
