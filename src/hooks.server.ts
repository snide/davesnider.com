import { checkAuth } from '$lib/server/auth';
import { errorMessages } from '$lib/server/errors';
import { error, type Handle, type HandleServerError } from '@sveltejs/kit';

const WEBHOOK_PATHS = ['/api/activity/webhook/'];

function isWebhookRoute(pathname: string): boolean {
  return WEBHOOK_PATHS.some((path) => pathname.startsWith(path));
}

export const handle: Handle = async ({ event, resolve }) => {
  // Custom CSRF protection that whitelists webhook routes
  const { request, url } = event;
  const method = request.method;

  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    if (!isWebhookRoute(url.pathname)) {
      const origin = request.headers.get('origin');
      const host = url.host;

      if (origin && new URL(origin).host !== host) {
        throw error(403, 'Cross-site POST form submissions are forbidden');
      }
    }
  }

  const isLoggedIn = checkAuth(event.cookies);

  event.locals.user = isLoggedIn ? { isLoggedIn: true } : null;

  const response = await resolve(event);
  return response;
};

// SvelteKit's default is console.error(error), which on prod printed a Drizzle
// "Failed query" without the libsql message beneath it — the replica failure
// of 2026-09-11 was never named in the logs. Print the whole cause chain.
export const handleError: HandleServerError = ({ error, event, status, message }) => {
  const route = `${event.request.method} ${event.url.pathname}${event.url.search}`;
  if (status === 404) {
    console.warn(`[404] ${route}`);
    return { message };
  }
  const chain = errorMessages(error);
  console.error(`[${status}] ${route}: ${chain[0] ?? message}`);
  for (const cause of chain.slice(1)) console.error(`  ↳ cause: ${cause}`);
  if (error instanceof Error && error.stack) console.error(error.stack);
  return { message };
};
