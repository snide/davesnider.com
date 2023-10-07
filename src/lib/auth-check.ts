// src/lib/auth-check.ts

export function isAuthenticated(request: Request): boolean {
  const cookie = request.headers.get('Cookie');

  if (!cookie) return false;

  const authCookie = cookie.split(';').find((c) => c.trim().startsWith('auth='));

  if (!authCookie) return false;

  const authValue = authCookie.split('=')[1].trim();

  return authValue === 'some_secure_value';
}
