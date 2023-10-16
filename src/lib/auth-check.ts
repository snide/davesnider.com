import { type APIContext } from 'astro';
export const isAuthenticated = ({ request }: APIContext) => {
  const cookies = new Headers(request.headers).get('Cookie');
  const authCookieValue = cookies
    ?.split(';')
    .find((row) => row.trim().startsWith('auth='))
    ?.split('=')[1];

  const isAuthenticated = authCookieValue?.trim() === import.meta.env.AUTH_COOKIE_VALUE.trim();
  return isAuthenticated;
};
