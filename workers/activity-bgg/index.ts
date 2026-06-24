interface Env {
  BGG_USERNAME: string;
  BGG_API_TOKEN: string;
  ACTIVITY_INGEST_TOKEN: string;
  INGEST_URL: string;
}

interface BggPlay {
  id: string;
  date: string;
  location: string;
  incomplete: boolean;
  gameName: string;
  gameId: number;
  numPlayers: number;
  won?: boolean;
  comments: string;
}

interface BggGameDetails {
  imageUrl?: string; // Full-size box art
  year?: number; // Year published
  coop?: boolean; // Has the "Cooperative Game" mechanic
}

// BGG returns up to 100 plays per page
const PLAYS_PER_PAGE = 100;

const BGG_API = 'https://boardgamegeek.com/xmlapi2';

// Simple XML attribute extractor
function getAttr(xml: string, attr: string): string {
  const match = xml.match(new RegExp(`${attr}="([^"]*)"`));
  return match ? match[1] : '';
}

// Extract content between tags
function getTagContent(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : '';
}

// Decode XML entities
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

// Convert inline BGG BBCode (links, emphasis) to HTML. Line/list structure is
// handled separately by commentToHtml so it isn't applied here.
function convertInlineBbCode(text: string): string {
  return (
    text
      // [thing=12345]Game Name[/thing] -> link to game
      .replace(
        /\[thing=(\d+)\](.*?)\[\/thing\]/g,
        '<a href="https://boardgamegeek.com/boardgame/$1" target="_blank" rel="noopener noreferrer">$2</a>'
      )
      // [user=username]Display Name[/user] -> link to user
      .replace(
        /\[user=([^\]]+)\](.*?)\[\/user\]/g,
        '<a href="https://boardgamegeek.com/user/$1" target="_blank" rel="noopener noreferrer">$2</a>'
      )
      // [url=...]text[/url] -> external link
      .replace(/\[url=([^\]]+)\](.*?)\[\/url\]/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>')
      // [b]bold[/b]
      .replace(/\[b\](.*?)\[\/b\]/g, '<strong>$1</strong>')
      // [i]italic[/i]
      .replace(/\[i\](.*?)\[\/i\]/g, '<em>$1</em>')
      // [u]underline[/u]
      .replace(/\[u\](.*?)\[\/u\]/g, '<u>$1</u>')
  );
}

// Build HTML from a comment. BG Stats writes expansion lists as consecutive
// lines starting with "- " (game names use an en-dash "–", so they don't
// collide); those runs become a real <ul>. Remaining text lines each become a
// <p>.
function commentToHtml(text: string): string {
  let html = '';
  let inList = false;

  for (const rawLine of text.split('\n')) {
    const line = convertInlineBbCode(rawLine).trim();
    const bullet = line.match(/^[-*]\s+(.+)$/);

    if (bullet) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${bullet[1].trim()}</li>`;
    } else {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      if (line) html += `<p>${line}</p>`;
    }
  }

  if (inList) html += '</ul>';
  return html;
}

// Parse the <play> elements out of a single page of the plays XML
function parsePlaysPage(xml: string, username: string): BggPlay[] {
  const plays: BggPlay[] = [];
  const playMatches = xml.matchAll(/<play\s+([^>]+)>([\s\S]*?)<\/play>/g);

  for (const match of playMatches) {
    const playAttrs = match[1];
    const playContent = match[2];

    const id = getAttr(playAttrs, 'id');
    const date = getAttr(playAttrs, 'date');
    const location = decodeXmlEntities(getAttr(playAttrs, 'location'));
    const incomplete = getAttr(playAttrs, 'incomplete') === '1';

    // Extract item (game) info
    const itemMatch = playContent.match(/<item\s+([^>]+)/);
    const itemAttrs = itemMatch ? itemMatch[1] : '';
    const gameName = decodeXmlEntities(getAttr(itemAttrs, 'name'));
    const gameId = parseInt(getAttr(itemAttrs, 'objectid'), 10);

    // Player records: count them, and read our own win flag (matched by
    // username; left undefined when our result wasn't recorded).
    const playerTags = playContent.match(/<player\s[^>]*\/?>/g) || [];
    const numPlayers = playerTags.length;
    const myPlayer = playerTags.find((tag) => getAttr(tag, 'username') === username);
    const won = myPlayer ? getAttr(myPlayer, 'win') === '1' : undefined;

    // Get comments and convert BBCode to HTML. Strip the "#bgstats" tag the
    // BG Stats app appends, then collapse the whitespace it leaves behind.
    const rawComments = decodeXmlEntities(getTagContent(playContent, 'comments'))
      .replace(/#bgstats/gi, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    const comments = rawComments ? commentToHtml(rawComments) : '';

    if (id && date && gameName && gameId) {
      plays.push({ id, date, location, incomplete, gameName, gameId, numPlayers, won, comments });
    }
  }

  return plays;
}

// Fetch play history, paging through the feed. When `mindate` is set (the most
// recent play we've already ingested), BGG only returns plays on/after that
// date, so steady-state runs fetch a single small page instead of everything.
async function fetchPlays(username: string, apiToken: string, mindate?: string): Promise<BggPlay[]> {
  const headers = {
    'User-Agent': 'DaveSniderActivityFeed/1.0 (personal activity tracker; contact@davesnider.com)',
    Authorization: `Bearer ${apiToken}`
  };
  const base = `${BGG_API}/plays?username=${encodeURIComponent(username)}${mindate ? `&mindate=${mindate}` : ''}`;

  // Fetch the first page to discover the total play count
  const firstResponse = await fetch(`${base}&page=1`, { headers });
  if (!firstResponse.ok) {
    throw new Error(`BGG API error: ${firstResponse.status}`);
  }

  const firstXml = await firstResponse.text();
  const total = parseInt(getAttr(firstXml.match(/<plays\s+([^>]+)>/)?.[1] ?? '', 'total'), 10) || 0;
  const plays: BggPlay[] = parsePlaysPage(firstXml, username);

  const totalPages = Math.ceil(total / PLAYS_PER_PAGE);
  for (let page = 2; page <= totalPages; page++) {
    // Be polite to BGG's API between page requests
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const response = await fetch(`${base}&page=${page}`, { headers });
    if (!response.ok) {
      console.warn(`BGG plays page ${page} failed: ${response.status}`);
      continue;
    }

    const pagePlays = parsePlaysPage(await response.text(), username);
    if (pagePlays.length === 0) break;
    plays.push(...pagePlays);
  }

  return plays;
}

// Fetch box art + year published for a set of games, batched
async function fetchGameDetails(gameIds: number[], apiToken: string): Promise<Map<number, BggGameDetails>> {
  const details = new Map<number, BggGameDetails>();
  if (gameIds.length === 0) return details;

  // BGG allows up to 20 items per request
  const batchSize = 20;
  for (let i = 0; i < gameIds.length; i += batchSize) {
    const batch = gameIds.slice(i, i + batchSize);
    const ids = batch.join(',');

    const response = await fetch(`${BGG_API}/thing?id=${ids}&type=boardgame`, {
      headers: {
        'User-Agent': 'DaveSniderActivityFeed/1.0 (personal activity tracker; contact@davesnider.com)',
        Authorization: `Bearer ${apiToken}`
      }
    });

    if (response.ok) {
      const xml = await response.text();

      // Split into individual <item> blocks so we can read each game's fields
      const itemMatches = xml.matchAll(/<item\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/item>/g);
      for (const match of itemMatches) {
        const id = parseInt(match[1], 10);
        const itemXml = match[2];

        // Prefer the full-size <image> (box art) over the cropped <thumbnail>
        const imageUrl = getTagContent(itemXml, 'image') || getTagContent(itemXml, 'thumbnail') || undefined;
        const yearMatch = itemXml.match(/<yearpublished[^>]*value="(-?\d+)"/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
        // Cooperative games have a "Cooperative Game" boardgamemechanic link
        const coop = /<link type="boardgamemechanic"[^>]*value="[^"]*Cooperative[^"]*"/i.test(itemXml);

        details.set(id, { imageUrl, year: year && year > 0 ? year : undefined, coop });
      }
    }

    // Small delay between batches
    if (i + batchSize < gameIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return details;
}

// The owner's timezone. BGG plays carry only a date (no time), so we anchor that
// date to this zone rather than to UTC — otherwise a play reads as early morning
// (noon UTC is 8am Eastern) and the feed's relative time looks too early.
const OWNER_TZ = 'America/New_York';

// UTC seconds for noon wall-clock on `dateStr` in `tz` (DST-aware).
function zonedNoon(dateStr: string, tz: string): number {
  const guess = new Date(`${dateStr}T12:00:00Z`).getTime();
  const asUTC = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const asTZ = new Date(new Date(guess).toLocaleString('en-US', { timeZone: tz })).getTime();
  const offset = asTZ - asUTC; // negative for zones west of UTC
  return Math.floor((guess - offset) / 1000);
}

function parsePlayDate(dateStr: string): number {
  // BGG dates are YYYY-MM-DD with no time component. The worker runs hourly, so if
  // the play is dated today we use the ingest moment — the feed then reads "just
  // now" / "1h ago" for a freshly logged play. Backdated plays (logged after the
  // fact) anchor to noon local on their actual date so they bucket onto the correct
  // day in the heatmap instead of today.
  const now = new Date();
  const todayLocal = now.toLocaleDateString('en-CA', { timeZone: OWNER_TZ }); // YYYY-MM-DD
  if (dateStr === todayLocal) {
    return Math.floor(now.getTime() / 1000);
  }
  return zonedNoon(dateStr, OWNER_TZ);
}

// BGG plays can be edited after they're first logged (a score added, a
// win/loss recorded an hour later). To catch those edits we always look back at
// least this many days — otherwise `mindate` would pin the fetch to the most
// recent play and we'd never re-see an edited older play.
const EDIT_LOOKBACK_DAYS = 7;

// The earliest date to fetch from BGG. We re-check the last week for edits, but
// if the last ingested play is older than that we keep reaching back to it so
// we don't miss new plays. Null (full sync) stays null.
function computeMindate(latestPlayDate: string | null): string | undefined {
  if (!latestPlayDate) return undefined;
  const lookback = new Date(Date.now() - EDIT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
    timeZone: OWNER_TZ
  });
  // YYYY-MM-DD compares lexicographically = chronologically, so this is min().
  return latestPlayDate < lookback ? latestPlayDate : lookback;
}

// Ask the app what it already has so we only fetch the delta from BGG. Falls
// back to a full sync if the state can't be read.
async function fetchIngestState(env: Env): Promise<{ latestPlayDate: string | null; gameIds: number[] }> {
  try {
    const response = await fetch(env.INGEST_URL, {
      headers: { Authorization: `Bearer ${env.ACTIVITY_INGEST_TOKEN}` }
    });
    if (!response.ok) throw new Error(`state request failed: ${response.status}`);
    const state = (await response.json()) as { latestPlayDate?: string | null; gameIds?: number[] };
    return { latestPlayDate: state.latestPlayDate ?? null, gameIds: state.gameIds ?? [] };
  } catch (err) {
    console.warn('Could not read ingest state, doing a full sync:', err);
    return { latestPlayDate: null, gameIds: [] };
  }
}

async function processPlays(env: Env): Promise<{ items: unknown[]; errors: string[] }> {
  // Figure out what's already ingested so we can fetch incrementally
  const { latestPlayDate, gameIds } = await fetchIngestState(env);
  const knownGameIds = new Set(gameIds);
  const mindate = computeMindate(latestPlayDate);

  console.log(`Fetching BGG plays for: ${env.BGG_USERNAME}${mindate ? ` since ${mindate}` : ' (full sync)'}`);
  const plays = await fetchPlays(env.BGG_USERNAME, env.BGG_API_TOKEN, mindate);
  console.log(`Found ${plays.length} plays`);

  // Only fetch game metadata (box art / year / coop) for games we don't already
  // have — the ingest reuses existing details for games it already knows.
  const newGameIds = [...new Set(plays.map((p) => p.gameId))].filter((id) => !knownGameIds.has(id));
  const gameDetails = await fetchGameDetails(newGameIds, env.BGG_API_TOKEN);
  console.log(`Fetching details for ${newGameIds.length} new game(s)`);

  const items = plays.map((play) => {
    const details = gameDetails.get(play.gameId);
    return {
      externalId: play.id,
      timestamp: parsePlayDate(play.date),
      title: play.gameName,
      url: `https://boardgamegeek.com/boardgame/${play.gameId}`,
      thumbnailUrl: details?.imageUrl,
      gameId: play.gameId,
      gameYear: details?.year,
      playDate: play.date,
      location: play.location || undefined,
      numPlayers: play.numPlayers || undefined,
      won: play.won,
      coop: details?.coop,
      comments: play.comments || undefined,
      incomplete: play.incomplete
    };
  });

  return { items, errors: [] };
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('BGG activity worker triggered');

    try {
      const { items, errors } = await processPlays(env);

      if (errors.length > 0) {
        console.warn('Some items failed:', errors);
      }

      const response = await fetch(env.INGEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.ACTIVITY_INGEST_TOKEN}`
        },
        body: JSON.stringify({ items, deletedIds: [] })
      });

      if (!response.ok) {
        throw new Error(`Ingest failed: ${response.status} ${await response.text()}`);
      }

      const result = await response.json();
      console.log('BGG ingest result:', result);
    } catch (error) {
      console.error('BGG worker error:', error);
      throw error;
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'POST') {
      // Validate bearer token
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || authHeader !== `Bearer ${env.ACTIVITY_INGEST_TOKEN}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        const { items, errors } = await processPlays(env);

        const response = await fetch(env.INGEST_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.ACTIVITY_INGEST_TOKEN}`
          },
          body: JSON.stringify({ items, deletedIds: [] })
        });

        if (!response.ok) {
          const text = await response.text();
          return new Response(JSON.stringify({ error: `Ingest failed: ${response.status}`, details: text }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const result = await response.json();
        return new Response(JSON.stringify({ ...result, processingErrors: errors }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }
};
