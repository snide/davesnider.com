import { checkAuth } from '$lib/server/auth';
import { error, type Handle } from '@sveltejs/kit';

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
