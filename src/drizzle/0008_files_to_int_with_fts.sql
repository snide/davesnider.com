-- Custom SQL migration file, put you code below! --
ALTER TABLE files RENAME TO files_old;
--> statement-breakpoint

CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fileId TEXT UNIQUE NOT NULL,
  url TEXT,
  original_upload_date INTEGER,
  vision_label TEXT,
  vision_image_properties TEXT,
  dominant_color TEXT,
  text_content TEXT,
  vision_text TEXT,
  focus_color TEXT,
  file_type_category TEXT NOT NULL DEFAULT 'unknown',
  is_hidden INTEGER NOT NULL DEFAULT false,
  is_favorite INTEGER NOT NULL DEFAULT false
);
--> statement-breakpoint

INSERT INTO files (
  fileId, url, original_upload_date, vision_label, vision_image_properties,
  dominant_color, text_content, vision_text, focus_color, file_type_category,
  is_hidden, is_favorite
)
SELECT
  id, url, original_upload_date, vision_label, vision_image_properties,
  dominant_color, text_content, vision_text, focus_color, file_type_category,
  is_hidden, is_favorite
FROM files_old;
--> statement-breakpoint

DROP TABLE files_old;
--> statement-breakpoint

DROP TABLE IF EXISTS files_fts;
--> statement-breakpoint
CREATE VIRTUAL TABLE files_fts USING fts5(
  text_content,
  content='files',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

DROP TRIGGER IF EXISTS files_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS files_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS files_au;
--> statement-breakpoint

INSERT into files_fts(files_fts) VALUES('rebuild');
--> statement-breakpoint

-- Recreate triggers to keep the `files_fts` table in sync with `files`.
CREATE TRIGGER files_ai AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, text_content) VALUES (new.id, new.text_content);
END;
--> statement-breakpoint

CREATE TRIGGER files_ad AFTER DELETE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid) VALUES('delete', old.id);
END;
--> statement-breakpoint

CREATE TRIGGER files_au AFTER UPDATE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid) VALUES('delete', old.id);
  INSERT INTO files_fts(rowid, text_content) VALUES (new.id, new.text_content);
END;
