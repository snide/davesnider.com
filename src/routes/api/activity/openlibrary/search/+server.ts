import { checkAuth } from '$lib/server/auth';
import { searchBooks } from '$lib/server/openlibrary';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
  if (!checkAuth(cookies)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) {
    return json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  const results = await searchBooks(q);
  if (!results) {
    return json({ error: 'Open Library search failed' }, { status: 502 });
  }

  return json({ results });
};
