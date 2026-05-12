import { AUTH_COOKIE_VALUE } from '$env/static/private';
import type { Cookies } from '@sveltejs/kit';

export function checkAuth(cookies: Cookies): boolean {
	const authCookie = cookies.get('auth');
	return authCookie === AUTH_COOKIE_VALUE;
}
