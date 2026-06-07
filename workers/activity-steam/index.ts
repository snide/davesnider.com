interface Env {
  STEAM_API_KEY: string;
  STEAM_USER_ID: string;
  ACTIVITY_INGEST_TOKEN: string;
  INGEST_URL: string;
}

interface SteamAchievement {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  unlockedAt: number;
}

interface SteamItem {
  externalId: string;
  timestamp: number;
  appId: number;
  gameTitle: string;
  gameHeaderUrl?: string;
  gamePosterUrl?: string;
  gameYear?: number;
  gameDeveloper?: string;
  achievements: SteamAchievement[];
}

interface OwnedGame {
  appid: number;
  name: string;
  playtime_2weeks?: number;
  playtime_forever: number;
}

interface PlayerAchievement {
  apiname: string;
  achieved: number;
  unlocktime: number;
}

interface AchievementSchema {
  name: string;
  displayName: string;
  description?: string;
  icon: string;
}

interface GameDetails {
  name: string;
  header_image: string;
  release_date?: { date: string };
  developers?: string[];
}

const STEAM_API = 'https://api.steampowered.com';
const STORE_API = 'https://store.steampowered.com/api';

// Two weeks ago in seconds
const TWO_WEEKS_AGO = Math.floor(Date.now() / 1000) - 14 * 24 * 60 * 60;

async function fetchOwnedGames(apiKey: string, userId: string): Promise<OwnedGame[]> {
  const url = `${STEAM_API}/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${userId}&include_appinfo=1&include_played_free_games=1`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch owned games: ${response.status}`);
  }

  const data = (await response.json()) as { response: { games?: OwnedGame[] } };
  return data.response.games || [];
}

async function fetchPlayerAchievements(apiKey: string, userId: string, appId: number): Promise<PlayerAchievement[]> {
  const url = `${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${userId}&appid=${appId}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      // Some games don't have achievements
      return [];
    }

    const data = (await response.json()) as {
      playerstats: { success: boolean; achievements?: PlayerAchievement[] };
    };

    if (!data.playerstats.success) {
      return [];
    }

    return data.playerstats.achievements || [];
  } catch {
    return [];
  }
}

async function fetchAchievementSchema(apiKey: string, appId: number): Promise<Map<string, AchievementSchema>> {
  const url = `${STEAM_API}/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appId}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return new Map();
    }

    const data = (await response.json()) as {
      game: { availableGameStats?: { achievements?: AchievementSchema[] } };
    };

    const achievements = data.game?.availableGameStats?.achievements || [];
    const schemaMap = new Map<string, AchievementSchema>();

    for (const achievement of achievements) {
      schemaMap.set(achievement.name, achievement);
    }

    return schemaMap;
  } catch {
    return new Map();
  }
}

async function fetchGameDetails(appId: number): Promise<GameDetails | null> {
  const url = `${STORE_API}/appdetails?appids=${appId}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Record<string, { success: boolean; data?: GameDetails }>;
    const gameData = data[String(appId)];

    if (!gameData?.success || !gameData.data) {
      return null;
    }

    return gameData.data;
  } catch {
    return null;
  }
}

function parseYear(dateStr: string): number | undefined {
  // Steam dates are like "Dec 9, 2023" or "2023"
  const match = dateStr.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : undefined;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

async function processAchievements(env: Env): Promise<{ items: SteamItem[]; errors: string[] }> {
  console.log(`Fetching Steam games for user: ${env.STEAM_USER_ID}`);

  const games = await fetchOwnedGames(env.STEAM_API_KEY, env.STEAM_USER_ID);
  console.log(`Found ${games.length} owned games`);

  // Filter to games played in the last 2 weeks
  const recentGames = games.filter((g) => g.playtime_2weeks && g.playtime_2weeks > 0);
  console.log(`Found ${recentGames.length} games played in the last 2 weeks`);

  const items: SteamItem[] = [];
  const errors: string[] = [];

  // Process each recent game
  for (const game of recentGames) {
    try {
      // Fetch achievements for this game
      const playerAchievements = await fetchPlayerAchievements(env.STEAM_API_KEY, env.STEAM_USER_ID, game.appid);

      // Filter to recently unlocked achievements (last 2 weeks)
      const recentAchievements = playerAchievements.filter((a) => a.achieved === 1 && a.unlocktime > TWO_WEEKS_AGO);

      if (recentAchievements.length === 0) {
        continue;
      }

      // Fetch achievement schema for icons/descriptions
      const schema = await fetchAchievementSchema(env.STEAM_API_KEY, game.appid);

      // Fetch game details
      const gameDetails = await fetchGameDetails(game.appid);

      // Group achievements by day
      const achievementsByDay = new Map<string, typeof recentAchievements>();

      for (const achievement of recentAchievements) {
        const day = formatDate(achievement.unlocktime);
        const existing = achievementsByDay.get(day) || [];
        existing.push(achievement);
        achievementsByDay.set(day, existing);
      }

      // Create an item for each day
      for (const [day, dayAchievements] of achievementsByDay) {
        const externalId = `${game.appid}_${day}`;

        // Find latest timestamp for this day
        const latestTimestamp = Math.max(...dayAchievements.map((a) => a.unlocktime));

        // Build achievement details
        const achievements: SteamAchievement[] = dayAchievements.map((a) => {
          const schemaInfo = schema.get(a.apiname);
          return {
            id: a.apiname,
            name: schemaInfo?.displayName || a.apiname,
            description: schemaInfo?.description,
            iconUrl: schemaInfo?.icon,
            unlockedAt: a.unlocktime
          };
        });

        // Sort achievements by unlock time
        achievements.sort((a, b) => a.unlockedAt - b.unlockedAt);

        items.push({
          externalId,
          timestamp: latestTimestamp,
          appId: game.appid,
          gameTitle: gameDetails?.name || game.name,
          gameHeaderUrl: gameDetails?.header_image,
          gamePosterUrl: `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/library_600x900.jpg`,
          gameYear: gameDetails?.release_date?.date ? parseYear(gameDetails.release_date.date) : undefined,
          gameDeveloper: gameDetails?.developers?.[0],
          achievements
        });
      }

      // Rate limit: small delay between game fetches
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err) {
      errors.push(`Failed to process game ${game.appid}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { items, errors };
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Steam activity worker triggered');

    try {
      const { items, errors } = await processAchievements(env);

      if (errors.length > 0) {
        console.warn('Some items failed:', errors);
      }

      if (items.length === 0) {
        console.log('No new achievements to ingest');
        return;
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
      console.log('Steam ingest result:', result);
    } catch (error) {
      console.error('Steam worker error:', error);
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
        const { items, errors } = await processAchievements(env);

        if (items.length === 0) {
          return new Response(
            JSON.stringify({ success: true, message: 'No new achievements', processingErrors: errors }),
            { headers: { 'Content-Type': 'application/json' } }
          );
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
