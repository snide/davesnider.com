import type { Cookies } from '@sveltejs/kit';

export function checkAuth(cookies: Cookies): boolean {
  const authCookie = cookies.get('auth');
  return authCookie === process.env.AUTH_COOKIE_VALUE;
}
