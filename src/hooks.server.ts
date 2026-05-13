import { checkAuth } from '$lib/server/auth';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const isLoggedIn = checkAuth(event.cookies);

  event.locals.user = isLoggedIn ? { isLoggedIn: true } : null;

  const response = await resolve(event);
  return response;
};
