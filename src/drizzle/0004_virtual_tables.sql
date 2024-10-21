-- Custom SQL migration file, put you code below! --

CREATE VIRTUAL TABLE IF NOT EXISTS links_fts USING fts5(
  title,
  comment,
  url,
  tags,
  content='links',
  content_rowid='id'
);
--> statement-breakpoint

INSERT into links_fts(links_fts) VALUES('rebuild');
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS links_ai AFTER INSERT ON links BEGIN
  INSERT INTO links_fts(rowid, title, comment, url, tags) VALUES (new.id, new.title, new.comment, new.url, new.tags);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS links_ad AFTER DELETE ON links BEGIN
  INSERT INTO links_fts(links_fts, rowid, title, comment, url, tags) VALUES('delete', old.id, old.title, old.comment, old.url, old.tags);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS links_au AFTER UPDATE ON links BEGIN
  INSERT INTO links_fts(links_fts, rowid, title, comment, url, tags) VALUES('delete', old.id, old.title, old.comment, old.url, old.tags);
  INSERT INTO links_fts(rowid, title, comment, url, tags) VALUES (new.id, new.title, new.comment, new.url, new.tags);
END;
