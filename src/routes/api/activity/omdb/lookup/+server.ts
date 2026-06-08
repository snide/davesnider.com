import { checkAuth } from '$lib/server/auth';
import { fetchOmdbById } from '$lib/server/omdb';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export interface OmdbLookupResponse {
  type: 'movie' | 'series' | 'episode';
  title: string;
  year: string;
  poster: string | null;
  imdbId: string;
  director?: string;
  // Episode-specific fields
  season?: number;
  episode?: number;
  seriesId?: string;
  seriesTitle?: string;
  seriesYear?: string;
  seriesPoster?: string | null;
}

export const GET: RequestHandler = async ({ url, cookies }) => {
  if (!checkAuth(cookies)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const imdbId = url.searchParams.get('i');
  if (!imdbId || !imdbId.startsWith('tt')) {
    return json({ error: 'Invalid IMDB ID. Must start with "tt"' }, { status: 400 });
  }

  const data = await fetchOmdbById(imdbId);
  if (!data || data.Response !== 'True') {
    return json({ error: data?.Error || 'Not found' }, { status: 404 });
  }

  const poster = data.Poster && data.Poster !== 'N/A' ? data.Poster : null;

  const response: OmdbLookupResponse = {
    type: data.Type as 'movie' | 'series' | 'episode',
    title: data.Title || '',
    year: data.Year || '',
    poster,
    imdbId: data.imdbID || imdbId,
    director: data.Director && data.Director !== 'N/A' ? data.Director : undefined
  };

  // If it's an episode, fetch series data too
  if (data.Type === 'episode' && data.seriesID) {
    response.season = data.Season ? parseInt(data.Season, 10) : undefined;
    response.episode = data.Episode ? parseInt(data.Episode, 10) : undefined;
    response.seriesId = data.seriesID;

    const seriesData = await fetchOmdbById(data.seriesID);
    if (seriesData && seriesData.Response === 'True') {
      response.seriesTitle = seriesData.Title;
      response.seriesYear = seriesData.Year;
      response.seriesPoster = seriesData.Poster && seriesData.Poster !== 'N/A' ? seriesData.Poster : null;
    }
  }

  return json(response);
};
