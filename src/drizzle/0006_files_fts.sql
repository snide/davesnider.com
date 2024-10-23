-- Custom SQL migration file, put you code below! --

DROP TABLE IF EXISTS files_fts;
--> statement-breakpoint

CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  text_content,
  vision_label,
  content='files',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

INSERT into files_fts(files_fts) VALUES('rebuild');
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, text_content, vision_label) VALUES (new.id, new.text_content, new.vision_label);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, text_content, vision_label) VALUES('delete', old.id, old.text_content, old.vision_label);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, text_content, vision_label) VALUES('delete', old.id, old.text_content, old.vision_label);
  INSERT INTO files_fts(rowid, title, text_content, vision_label) VALUES (new.id, new.text_content, new.vision_label);
END;
