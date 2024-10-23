-- Custom SQL migration file, put you code below! --

DROP TABLE IF EXISTS files_fts;
--> statement-breakpoint

CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  text_content,
  content='files',
  content_rowid='id',
);
--> statement-breakpoint

INSERT into files_fts(files_fts) VALUES('rebuild');
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, text_content) VALUES (new.id, new.text_content);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, text_content) VALUES('delete', old.id, old.text_content);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, text_content) VALUES('delete', old.id, old.text_content);
  INSERT INTO files_fts(rowid, text_content) VALUES (new.id, new.text_content);
END;
