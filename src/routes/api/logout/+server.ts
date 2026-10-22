import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  return Response.json(
    { message: 'Logged out' },
    {
      status: 200,
      headers: {
        'Set-Cookie': 'auth=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict;'
      }
    }
  );
};
