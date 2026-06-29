/**
 * Extracts an IMDB title ID (e.g. "tt1234567") from user input, which may be a
 * raw ID or a full IMDB URL such as:
 *   - https://www.imdb.com/title/tt1234567/
 *   - https://m.imdb.com/title/tt1234567/?ref_=foo
 *   - imdb.com/title/tt1234567
 *   - tt1234567
 *
 * Returns the lowercase `tt`-prefixed ID, or null if none can be found.
 */
export function parseImdbId(input: string): string | null {
  const match = input
    .trim()
    .toLowerCase()
    .match(/tt\d{6,}/);
  return match ? match[0] : null;
}
