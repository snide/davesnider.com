import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const data = await request.json();
  const { username, password } = data;

  if (username === process.env.LOGIN_U && password === process.env.LOGIN_P) {
    return json(
      { message: 'Success!' },
      {
        status: 200,
        headers: {
          'Set-Cookie': `auth=${process.env.AUTH_COOKIE_VALUE}; Secure; HttpOnly; SameSite=Strict; Path=/`
        }
      }
    );
  } else {
    return json({ message: 'Incorrect credentials' }, { status: 401 });
  }
};
