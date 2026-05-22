import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const fileUrl = url.searchParams.get('url');

  if (!fileUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Only allow proxying from our files domain
  if (!fileUrl.startsWith('https://files.davesnider.com/')) {
    return new Response('Invalid URL - only files.davesnider.com allowed', { status: 403 });
  }

  try {
    const response = await fetch(fileUrl);

    if (!response.ok) {
      return new Response(`Failed to fetch file: ${response.status}`, { status: response.status });
    }

    const data = await response.arrayBuffer();

    return new Response(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000'
      }
    });
  } catch (error) {
    console.error('Proxy fetch error:', error);
    return new Response('Failed to fetch file', { status: 500 });
  }
};
