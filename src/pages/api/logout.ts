import type { APIRoute } from 'astro';

export const POST: APIRoute = async () => {
  // Prepare the headers
  const headers = new Headers({
    'Content-Type': 'application/json'
  });
  headers.append('Set-Cookie', 'auth=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict;');

  return new Response(JSON.stringify({ message: 'Logged out' }), {
    status: 200,
    headers: headers
  });
};
