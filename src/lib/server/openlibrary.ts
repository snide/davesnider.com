// Open Library search client for manual book adds.
// Docs: https://openlibrary.org/dev/docs/api/search and /covers
// No API key; identified clients (User-Agent) get a higher rate limit.

export interface BookSearchResult {
  key: string; // Work OLID without the "/works/" prefix, e.g. "OL27448W"
  title: string;
  author: string | null;
  coverId: number | null;
  coverUrl: string | null; // Medium cover for previews
  year: number | null; // First publish year
  editionCount: number;
}

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  edition_count?: number;
}

const USER_AGENT = 'davesnider.com activity (https://davesnider.com)';

export function coverUrl(coverId: number, size: 'S' | 'M' | 'L'): string {
  // default=false → 404 instead of a blank placeholder when the cover is missing
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg?default=false`;
}

export function openLibraryWorkUrl(key: string): string {
  return `https://openlibrary.org/works/${key}`;
}

export async function searchBooks(query: string, limit = 10): Promise<BookSearchResult[] | null> {
  const params = new URLSearchParams({
    q: query,
    fields: 'key,title,author_name,cover_i,first_publish_year,edition_count',
    limit: limit.toString()
  });

  try {
    const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { docs?: OpenLibraryDoc[] };

    return (data.docs || [])
      .filter((doc) => doc.key && doc.title)
      .map((doc) => {
        const key = doc.key!.replace(/^\/works\//, '');
        const coverId = doc.cover_i ?? null;
        return {
          key,
          title: doc.title!,
          author: doc.author_name?.length ? doc.author_name.join(', ') : null,
          coverId,
          coverUrl: coverId ? coverUrl(coverId, 'M') : null,
          year: doc.first_publish_year ?? null,
          editionCount: doc.edition_count ?? 0
        };
      });
  } catch {
    return null;
  }
}
