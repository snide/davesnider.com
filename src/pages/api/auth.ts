import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  const data = await request.formData();
  const username = data.get('username');
  const password = data.get('password');

  // There is only one user, so we can hardcode the credentials
  if (username === import.meta.env.LOGIN_U && password === import.meta.env.LOGIN_P) {
    const cookieValue = import.meta.env.AUTH_COOKIE_VALUE;
    return new Response(
      JSON.stringify({
        message: 'Success!'
      }),
      {
        status: 200,
        headers: {
          'Set-Cookie': `auth=${cookieValue}; Secure; HttpOnly; SameSite=Strict; Path=/`
        }
      }
    );
  } else {
    return new Response(
      JSON.stringify({
        message: 'Incorrect credentials'
      }),
      { status: 401 }
    );
  }
};
