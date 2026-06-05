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
  comments: string;
  thumbnailUrl?: string;
}

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

// Convert BGG BBCode to HTML
function convertBbCode(text: string): string {
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
      // Newlines to <br>
      .replace(/\n/g, '<br>')
  );
}

async function fetchPlays(username: string, apiToken: string): Promise<BggPlay[]> {
  // Fetch recent plays (last 100)
  const response = await fetch(`${BGG_API}/plays?username=${encodeURIComponent(username)}&page=1`, {
    headers: {
      'User-Agent': 'DaveSniderActivityFeed/1.0 (personal activity tracker; contact@davesnider.com)',
      Authorization: `Bearer ${apiToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`BGG API error: ${response.status}`);
  }

  const xml = await response.text();
  const plays: BggPlay[] = [];

  // Extract each play element
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

    // Count players
    const playerMatches = playContent.match(/<player\s/g);
    const numPlayers = playerMatches ? playerMatches.length : 0;

    // Get comments and convert BBCode to HTML
    const rawComments = decodeXmlEntities(getTagContent(playContent, 'comments'));
    const comments = rawComments ? convertBbCode(rawComments) : '';

    if (id && date && gameName && gameId) {
      plays.push({
        id,
        date,
        location,
        incomplete,
        gameName,
        gameId,
        numPlayers,
        comments
      });
    }
  }

  return plays;
}

// Fetch game thumbnails in batch
async function fetchGameThumbnails(gameIds: number[], apiToken: string): Promise<Map<number, string>> {
  const thumbnails = new Map<number, string>();
  if (gameIds.length === 0) return thumbnails;

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

      // Extract each item's thumbnail
      const itemMatches = xml.matchAll(/<item[^>]+id="(\d+)"[^>]*>[\s\S]*?<thumbnail>([^<]+)<\/thumbnail>/g);
      for (const match of itemMatches) {
        const id = parseInt(match[1], 10);
        const thumb = match[2].trim();
        thumbnails.set(id, thumb);
      }
    }

    // Small delay between batches
    if (i + batchSize < gameIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return thumbnails;
}

function parsePlayDate(dateStr: string): number {
  // BGG dates are YYYY-MM-DD
  const date = new Date(dateStr + 'T12:00:00Z');
  return Math.floor(date.getTime() / 1000);
}

async function processPlays(env: Env): Promise<{ items: unknown[]; errors: string[] }> {
  console.log(`Fetching BGG plays for: ${env.BGG_USERNAME}`);
  const plays = await fetchPlays(env.BGG_USERNAME, env.BGG_API_TOKEN);
  console.log(`Found ${plays.length} plays`);

  // Fetch thumbnails for unique games
  const uniqueGameIds = [...new Set(plays.map((p) => p.gameId))];
  const thumbnails = await fetchGameThumbnails(uniqueGameIds, env.BGG_API_TOKEN);

  const items = plays.map((play) => ({
    externalId: play.id,
    timestamp: parsePlayDate(play.date),
    title: `Played ${play.gameName}`,
    url: `https://boardgamegeek.com/boardgame/${play.gameId}`,
    thumbnailUrl: thumbnails.get(play.gameId),
    gameId: play.gameId,
    playDate: play.date,
    location: play.location || undefined,
    numPlayers: play.numPlayers || undefined,
    comments: play.comments || undefined,
    incomplete: play.incomplete
  }));

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
