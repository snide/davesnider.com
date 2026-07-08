import {
  activityBggTable,
  activityGithubTable,
  activityPlexTable,
  activitySteamTable,
  activityTable,
  filesTable
} from '$db/schema';
import { db } from '$lib/server/db';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

export type MovieTeaser = {
  id: number;
  title: string | null;
  year: number | null;
  thumbnailUrl: string | null;
  rating: number | null;
  imdbId: string | null;
  imdbUrl: string | null;
  timestamp: number;
};

export type ShowTeaser = {
  id: number;
  title: string | null;
  year: number | null;
  thumbnailUrl: string | null;
  imdbId: string | null;
  imdbUrl: string | null;
  timestamp: number;
};

export type GameTeaser = {
  title: string;
  appId: number;
  thumbnailUrl: string | null;
  timestamp: number;
};

export type BoardGameTeaser = {
  id: number;
  title: string | null;
  gameId: number;
  thumbnailUrl: string | null;
  timestamp: number;
};

export type PrTeaser = {
  title: string | null;
  url: string | null;
  repo: string;
  prNumber: number | null;
  timestamp: number;
};

export type MuseumItemTeaser = {
  fileId: string;
  thumbUrl: string;
};

export type HomepageTeasers = {
  movies: MovieTeaser[];
  shows: ShowTeaser[];
  games: GameTeaser[];
  boardGames: BoardGameTeaser[];
  mergedPr: PrTeaser | null;
  museumItem: MuseumItemTeaser | null;
};

export async function getHomepageTeasers(): Promise<HomepageTeasers> {
  const [movieRows, showRows, steamRows, boardGameRows, mergedPrs, museumRows] = await Promise.all([
    // Over-fetch each activity query so repeats (rewatches, replays, repeat
    // sessions) still yield 3 distinct entries after deduping
    db
      .select({
        id: activityTable.id,
        title: activityPlexTable.title,
        year: activityPlexTable.year,
        thumbnailUrl: activityPlexTable.thumbnailUrl,
        rating: activityPlexTable.rating,
        imdbId: activityPlexTable.imdbId,
        imdbUrl: activityPlexTable.imdbUrl,
        timestamp: activityTable.timestamp
      })
      .from(activityTable)
      .innerJoin(activityPlexTable, eq(activityPlexTable.activityId, activityTable.id))
      .where(
        and(
          eq(activityTable.isPrivate, false),
          eq(activityTable.type, 'plex'),
          eq(activityPlexTable.mediaType, 'movie')
        )
      )
      .orderBy(desc(activityTable.timestamp))
      .limit(10),
    db
      .select({
        id: activityTable.id,
        title: activityPlexTable.title,
        year: activityPlexTable.year,
        thumbnailUrl: activityPlexTable.thumbnailUrl,
        imdbId: activityPlexTable.imdbId,
        imdbUrl: activityPlexTable.imdbUrl,
        timestamp: activityTable.timestamp
      })
      .from(activityTable)
      .innerJoin(activityPlexTable, eq(activityPlexTable.activityId, activityTable.id))
      .where(
        and(eq(activityTable.isPrivate, false), eq(activityTable.type, 'plex'), eq(activityPlexTable.mediaType, 'show'))
      )
      .orderBy(desc(activityTable.timestamp))
      .limit(10),
    db
      .select({
        title: activitySteamTable.gameTitle,
        appId: activitySteamTable.appId,
        thumbnailUrl: activitySteamTable.gamePosterUrl,
        timestamp: activityTable.timestamp
      })
      .from(activityTable)
      .innerJoin(activitySteamTable, eq(activitySteamTable.activityId, activityTable.id))
      .where(and(eq(activityTable.isPrivate, false), eq(activityTable.type, 'steam')))
      .orderBy(desc(activityTable.timestamp))
      .limit(10),
    db
      .select({
        id: activityTable.id,
        title: activityBggTable.title,
        gameId: activityBggTable.gameId,
        thumbnailUrl: activityBggTable.thumbnailUrl,
        timestamp: activityTable.timestamp
      })
      .from(activityTable)
      .innerJoin(activityBggTable, eq(activityBggTable.activityId, activityTable.id))
      .where(and(eq(activityTable.isPrivate, false), eq(activityTable.type, 'bgg')))
      .orderBy(desc(activityTable.timestamp))
      .limit(10),
    db
      .select({
        title: activityGithubTable.title,
        url: activityGithubTable.url,
        repo: activityGithubTable.repo,
        prNumber: activityGithubTable.prNumber,
        timestamp: activityTable.timestamp
      })
      .from(activityTable)
      .innerJoin(activityGithubTable, eq(activityGithubTable.activityId, activityTable.id))
      .where(
        and(
          eq(activityTable.isPrivate, false),
          eq(activityTable.type, 'github'),
          eq(activityGithubTable.eventType, 'pr_merged')
        )
      )
      .orderBy(desc(activityTable.timestamp))
      .limit(1),
    db
      .select({ fileId: filesTable.fileId, url: filesTable.url })
      .from(filesTable)
      .where(
        and(
          eq(filesTable.isHidden, false),
          eq(filesTable.isFavorite, true),
          eq(filesTable.fileTypeCategory, 'image'),
          isNotNull(filesTable.url)
        )
      )
      .orderBy(desc(filesTable.originalUploadDate))
      .limit(1)
  ]);

  const seenMovies = new Set<string>();
  const movies = movieRows
    .filter((row) => {
      const key = row.imdbId ?? row.title ?? String(row.id);
      if (seenMovies.has(key)) return false;
      seenMovies.add(key);
      return true;
    })
    .slice(0, 3);

  const seenShows = new Set<string>();
  const shows = showRows
    .filter((row) => {
      const key = row.imdbId ?? row.title ?? String(row.id);
      if (seenShows.has(key)) return false;
      seenShows.add(key);
      return true;
    })
    .slice(0, 3);

  const seenAppIds = new Set<number>();
  const games = steamRows
    .filter((row) => {
      if (seenAppIds.has(row.appId)) return false;
      seenAppIds.add(row.appId);
      return true;
    })
    .slice(0, 3);

  const seenGameIds = new Set<number>();
  const boardGames = boardGameRows
    .filter((row) => {
      if (seenGameIds.has(row.gameId)) return false;
      seenGameIds.add(row.gameId);
      return true;
    })
    .slice(0, 3);

  const museumRow = museumRows[0];
  const museumItem = museumRow?.url
    ? {
        fileId: museumRow.fileId,
        thumbUrl: `https://files.davesnider.com/cdn-cgi/image/w=600,h=600,fit=scale-down/${museumRow.url}`
      }
    : null;

  return {
    movies,
    shows,
    games,
    boardGames,
    mergedPr: mergedPrs[0] ?? null,
    museumItem
  };
}
