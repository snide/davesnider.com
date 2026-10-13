export interface OmdbResponse {
  Response: string;
  Title?: string;
  Year?: string;
  imdbID?: string;
  Type?: string; // "movie", "series", "episode"
  Poster?: string;
  Director?: string;
  Plot?: string;
  Error?: string;
  // Episode-specific fields
  Season?: string;
  Episode?: string;
  seriesID?: string; // IMDB ID of the parent series
  totalSeasons?: string; // Series only
}

export interface OmdbSearchItem {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string; // "movie", "series", "episode"
  Poster: string;
}

export interface OmdbSearchResponse {
  Response: string;
  Search?: OmdbSearchItem[];
  totalResults?: string;
  Error?: string;
}

export interface OmdbSeasonEpisode {
  Title: string;
  Released: string;
  Episode: string;
  imdbRating?: string;
  imdbID: string;
}

export interface OmdbSeasonResponse {
  Response: string;
  Title?: string;
  Season?: string;
  totalSeasons?: string;
  Episodes?: OmdbSeasonEpisode[];
  Error?: string;
}

const apiKey = process.env.OMDB_API_KEY;

export async function fetchOmdbByTitle(title: string, year?: number, type?: string): Promise<OmdbResponse | null> {
  if (!apiKey) return null;

  const params = new URLSearchParams({
    apikey: apiKey,
    t: title
  });

  if (year) {
    params.set('y', year.toString());
  }

  if (type) {
    params.set('type', type);
  }

  try {
    const response = await fetch(`https://www.omdbapi.com/?${params}`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchOmdbById(imdbId: string): Promise<OmdbResponse | null> {
  if (!apiKey) return null;

  const params = new URLSearchParams({
    apikey: apiKey,
    i: imdbId
  });

  try {
    const response = await fetch(`https://www.omdbapi.com/?${params}`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Title search (?s=). Returns up to 10 results per page.
export async function fetchOmdbSearch(query: string, type?: string): Promise<OmdbSearchResponse | null> {
  if (!apiKey) return null;

  const params = new URLSearchParams({
    apikey: apiKey,
    s: query
  });

  if (type) {
    params.set('type', type);
  }

  try {
    const response = await fetch(`https://www.omdbapi.com/?${params}`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Episode list for one season of a series (?i=<seriesId>&Season=N).
export async function fetchOmdbSeason(seriesId: string, season: number): Promise<OmdbSeasonResponse | null> {
  if (!apiKey) return null;

  const params = new URLSearchParams({
    apikey: apiKey,
    i: seriesId,
    Season: season.toString()
  });

  try {
    const response = await fetch(`https://www.omdbapi.com/?${params}`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export function extractImdbIdFromGuids(guids: Array<{ id: string }> | undefined): string | null {
  if (!guids) return null;
  const imdbGuid = guids.find((g) => g.id.startsWith('imdb://'));
  return imdbGuid ? imdbGuid.id.replace('imdb://', '') : null;
}
