import { checkAuth } from '$lib/server/auth';
import { fetchOmdbSeason } from '$lib/server/omdb';
import { parseImdbId } from '$lib/utils/imdb';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export interface OmdbSeasonEpisodeResult {
  imdbId: string;
  title: string;
  episode: number;
  released: string | null;
}

export interface OmdbSeasonResult {
  seriesTitle: string;
  season: number;
  totalSeasons: number | null;
  episodes: OmdbSeasonEpisodeResult[];
}

export const GET: RequestHandler = async ({ url, cookies }) => {
  if (!checkAuth(cookies)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const seriesInput = url.searchParams.get('i');
  const seriesId = seriesInput ? parseImdbId(seriesInput) : null;
  if (!seriesId) {
    return json({ error: 'Invalid series IMDB ID' }, { status: 400 });
  }

  const season = parseInt(url.searchParams.get('season') || '', 10);
  if (!Number.isInteger(season) || season < 1) {
    return json({ error: 'season must be a positive integer' }, { status: 400 });
  }

  const data = await fetchOmdbSeason(seriesId, season);
  if (!data || data.Response !== 'True') {
    return json({ error: data?.Error || 'Season not found' }, { status: 404 });
  }

  const totalSeasons = data.totalSeasons ? parseInt(data.totalSeasons, 10) : NaN;

  const episodes: OmdbSeasonEpisodeResult[] = (data.Episodes || [])
    .filter((ep) => ep.imdbID && ep.imdbID !== 'N/A')
    .map((ep) => ({
      imdbId: ep.imdbID,
      title: ep.Title || `Episode ${ep.Episode}`,
      episode: parseInt(ep.Episode, 10) || 0,
      released: ep.Released && ep.Released !== 'N/A' ? ep.Released : null
    }))
    .sort((a, b) => a.episode - b.episode);

  const result: OmdbSeasonResult = {
    seriesTitle: data.Title || '',
    season,
    totalSeasons: Number.isInteger(totalSeasons) ? totalSeasons : null,
    episodes
  };

  return json(result);
};
