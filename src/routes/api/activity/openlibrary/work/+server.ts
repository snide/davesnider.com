import { checkAuth } from '$lib/server/auth';
import { fetchWorkInfo } from '$lib/server/openlibrary';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const OLID_RE = /^OL\d+W$/;

export const GET: RequestHandler = async ({ url, cookies }) => {
  if (!checkAuth(cookies)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = (url.searchParams.get('key') || '').replace(/^\/works\//, '').trim();
  if (!OLID_RE.test(key)) {
    return json({ error: 'Invalid Open Library work key' }, { status: 400 });
  }

  const info = await fetchWorkInfo(key);
  if (!info) {
    return json({ error: 'Work not found' }, { status: 404 });
  }

  return json(info);
};
