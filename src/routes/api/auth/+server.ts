import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LOGIN_U, LOGIN_P, AUTH_COOKIE_VALUE } from '$env/static/private';

export const POST: RequestHandler = async ({ request }) => {
	const data = await request.json();
	const { username, password } = data;

	if (username === LOGIN_U && password === LOGIN_P) {
		return json(
			{ message: 'Success!' },
			{
				status: 200,
				headers: {
					'Set-Cookie': `auth=${AUTH_COOKIE_VALUE}; Secure; HttpOnly; SameSite=Strict; Path=/`
				}
			}
		);
	} else {
		return json({ message: 'Incorrect credentials' }, { status: 401 });
	}
};
