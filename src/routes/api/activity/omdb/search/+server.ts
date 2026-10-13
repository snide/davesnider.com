import { checkAuth } from '$lib/server/auth';
import { fetchOmdbSearch } from '$lib/server/omdb';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export interface OmdbSearchResult {
  imdbId: string;
  title: string;
  year: string;
  type: 'movie' | 'series' | 'episode';
  poster: string | null;
}

const VALID_TYPES = ['movie', 'series', 'episode'];

export const GET: RequestHandler = async ({ url, cookies }) => {
  if (!checkAuth(cookies)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) {
    return json({ error: 'Query must be at least 2 characters' }, { status: 400 });
  }

  const typeParam = url.searchParams.get('type');
  const type = typeParam && VALID_TYPES.includes(typeParam) ? typeParam : undefined;

  const data = await fetchOmdbSearch(q, type);
  if (!data) {
    return json({ error: 'OMDB search failed' }, { status: 502 });
  }

  // OMDB answers "Movie not found!" with Response=False for zero hits — that's an empty list, not an error
  if (data.Response !== 'True') {
    return json({ results: [] });
  }

  const results: OmdbSearchResult[] = (data.Search || [])
    .filter((item) => item.imdbID && item.Title)
    .map((item) => ({
      imdbId: item.imdbID,
      title: item.Title,
      year: item.Year || '',
      type: item.Type as OmdbSearchResult['type'],
      poster: item.Poster && item.Poster !== 'N/A' ? item.Poster : null
    }));

  return json({ results });
};
