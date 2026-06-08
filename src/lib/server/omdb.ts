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

export function extractImdbIdFromGuids(guids: Array<{ id: string }> | undefined): string | null {
  if (!guids) return null;
  const imdbGuid = guids.find((g) => g.id.startsWith('imdb://'));
  return imdbGuid ? imdbGuid.id.replace('imdb://', '') : null;
}
