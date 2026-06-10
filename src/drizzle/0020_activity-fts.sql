-- Custom SQL migration file, put your code below! --

-- Full-text search index over activity titles/bodies, one row per activity.
-- Standalone FTS5 table (not external-content) because the searchable text
-- lives across 7 per-type detail tables. rowid = activity.id, which is unique
-- across all types and makes joins back to `activity` trivial.
-- prefix='2 3' enables fast prefix queries (search-as-you-type with `term*`).
DROP TABLE IF EXISTS activity_fts;
--> statement-breakpoint
CREATE VIRTUAL TABLE activity_fts USING fts5(
  title,
  body,
  tokenize='porter unicode61',
  prefix='2 3'
);
--> statement-breakpoint

-- Belt-and-braces cleanup when an activity row is deleted directly.
-- (Detail-table delete triggers below also cover the FK cascade path.)
DROP TRIGGER IF EXISTS activity_fts_ad;
--> statement-breakpoint
CREATE TRIGGER activity_fts_ad AFTER DELETE ON activity BEGIN
  DELETE FROM activity_fts WHERE rowid = old.id;
END;
--> statement-breakpoint

-- Plex: title + review
DROP TRIGGER IF EXISTS activity_plex_fts_ai;
--> statement-breakpoint
CREATE TRIGGER activity_plex_fts_ai AFTER INSERT ON activity_plex BEGIN
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, new.review);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_plex_fts_au;
--> statement-breakpoint
CREATE TRIGGER activity_plex_fts_au AFTER UPDATE ON activity_plex BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, new.review);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_plex_fts_ad;
--> statement-breakpoint
CREATE TRIGGER activity_plex_fts_ad AFTER DELETE ON activity_plex BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
END;
--> statement-breakpoint

-- GitHub: title + repo + commit message
DROP TRIGGER IF EXISTS activity_github_fts_ai;
--> statement-breakpoint
CREATE TRIGGER activity_github_fts_ai AFTER INSERT ON activity_github BEGIN
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, trim(coalesce(new.repo, '') || ' ' || coalesce(new.commit_message, '')));
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_github_fts_au;
--> statement-breakpoint
CREATE TRIGGER activity_github_fts_au AFTER UPDATE ON activity_github BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, trim(coalesce(new.repo, '') || ' ' || coalesce(new.commit_message, '')));
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_github_fts_ad;
--> statement-breakpoint
CREATE TRIGGER activity_github_fts_ad AFTER DELETE ON activity_github BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
END;
--> statement-breakpoint

-- Bluesky: title + post text
DROP TRIGGER IF EXISTS activity_bluesky_fts_ai;
--> statement-breakpoint
CREATE TRIGGER activity_bluesky_fts_ai AFTER INSERT ON activity_bluesky BEGIN
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, new.post_text);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_bluesky_fts_au;
--> statement-breakpoint
CREATE TRIGGER activity_bluesky_fts_au AFTER UPDATE ON activity_bluesky BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, new.post_text);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_bluesky_fts_ad;
--> statement-breakpoint
CREATE TRIGGER activity_bluesky_fts_ad AFTER DELETE ON activity_bluesky BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
END;
--> statement-breakpoint

-- Reddit: title + body
DROP TRIGGER IF EXISTS activity_reddit_fts_ai;
--> statement-breakpoint
CREATE TRIGGER activity_reddit_fts_ai AFTER INSERT ON activity_reddit BEGIN
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, new.body);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_reddit_fts_au;
--> statement-breakpoint
CREATE TRIGGER activity_reddit_fts_au AFTER UPDATE ON activity_reddit BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, new.body);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_reddit_fts_ad;
--> statement-breakpoint
CREATE TRIGGER activity_reddit_fts_ad AFTER DELETE ON activity_reddit BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
END;
--> statement-breakpoint

-- Hacker News: title + body
DROP TRIGGER IF EXISTS activity_hackernews_fts_ai;
--> statement-breakpoint
CREATE TRIGGER activity_hackernews_fts_ai AFTER INSERT ON activity_hackernews BEGIN
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, new.body);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_hackernews_fts_au;
--> statement-breakpoint
CREATE TRIGGER activity_hackernews_fts_au AFTER UPDATE ON activity_hackernews BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, new.body);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_hackernews_fts_ad;
--> statement-breakpoint
CREATE TRIGGER activity_hackernews_fts_ad AFTER DELETE ON activity_hackernews BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
END;
--> statement-breakpoint

-- BGG: title + play comments + location
DROP TRIGGER IF EXISTS activity_bgg_fts_ai;
--> statement-breakpoint
CREATE TRIGGER activity_bgg_fts_ai AFTER INSERT ON activity_bgg BEGIN
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, trim(coalesce(new.comments, '') || ' ' || coalesce(new.location, '')));
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_bgg_fts_au;
--> statement-breakpoint
CREATE TRIGGER activity_bgg_fts_au AFTER UPDATE ON activity_bgg BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, trim(coalesce(new.comments, '') || ' ' || coalesce(new.location, '')));
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_bgg_fts_ad;
--> statement-breakpoint
CREATE TRIGGER activity_bgg_fts_ad AFTER DELETE ON activity_bgg BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
END;
--> statement-breakpoint

-- Steam: game title + achievement names/descriptions pulled out of the
-- achievements JSON array (json_each over NULL yields no rows, so the
-- subquery is NULL-safe for playtime-only sessions).
DROP TRIGGER IF EXISTS activity_steam_fts_ai;
--> statement-breakpoint
CREATE TRIGGER activity_steam_fts_ai AFTER INSERT ON activity_steam BEGIN
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (
    new.activity_id,
    new.game_title,
    (SELECT group_concat(coalesce(json_extract(value, '$.name'), '') || ' ' || coalesce(json_extract(value, '$.description'), ''), ' ')
     FROM json_each(coalesce(new.achievements, '[]')))
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_steam_fts_au;
--> statement-breakpoint
CREATE TRIGGER activity_steam_fts_au AFTER UPDATE ON activity_steam BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (
    new.activity_id,
    new.game_title,
    (SELECT group_concat(coalesce(json_extract(value, '$.name'), '') || ' ' || coalesce(json_extract(value, '$.description'), ''), ' ')
     FROM json_each(coalesce(new.achievements, '[]')))
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_steam_fts_ad;
--> statement-breakpoint
CREATE TRIGGER activity_steam_fts_ad AFTER DELETE ON activity_steam BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
END;
--> statement-breakpoint

-- Backfill existing rows, one pass per detail table (expressions mirror the
-- insert triggers above).
INSERT INTO activity_fts(rowid, title, body)
SELECT activity_id, title, review FROM activity_plex;
--> statement-breakpoint
INSERT INTO activity_fts(rowid, title, body)
SELECT activity_id, title, trim(coalesce(repo, '') || ' ' || coalesce(commit_message, '')) FROM activity_github;
--> statement-breakpoint
INSERT INTO activity_fts(rowid, title, body)
SELECT activity_id, title, post_text FROM activity_bluesky;
--> statement-breakpoint
INSERT INTO activity_fts(rowid, title, body)
SELECT activity_id, title, body FROM activity_reddit;
--> statement-breakpoint
INSERT INTO activity_fts(rowid, title, body)
SELECT activity_id, title, body FROM activity_hackernews;
--> statement-breakpoint
INSERT INTO activity_fts(rowid, title, body)
SELECT activity_id, title, trim(coalesce(comments, '') || ' ' || coalesce(location, '')) FROM activity_bgg;
--> statement-breakpoint
INSERT INTO activity_fts(rowid, title, body)
SELECT s.activity_id, s.game_title,
  (SELECT group_concat(coalesce(json_extract(value, '$.name'), '') || ' ' || coalesce(json_extract(value, '$.description'), ''), ' ')
   FROM json_each(coalesce(s.achievements, '[]')))
FROM activity_steam s;
