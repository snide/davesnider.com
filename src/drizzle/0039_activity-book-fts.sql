-- Custom SQL migration file, put your code below! --

-- Book activity FTS: title + author/review body, mirroring the per-type
-- trigger pattern from 0020_activity-fts.sql
DROP TRIGGER IF EXISTS activity_book_fts_ai;
--> statement-breakpoint
CREATE TRIGGER activity_book_fts_ai AFTER INSERT ON activity_book BEGIN
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, trim(coalesce(new.author, '') || ' ' || coalesce(new.review, '')));
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_book_fts_au;
--> statement-breakpoint
CREATE TRIGGER activity_book_fts_au AFTER UPDATE ON activity_book BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, trim(coalesce(new.author, '') || ' ' || coalesce(new.review, '')));
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_book_fts_ad;
--> statement-breakpoint
CREATE TRIGGER activity_book_fts_ad AFTER DELETE ON activity_book BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
END;
--> statement-breakpoint
INSERT INTO activity_fts(rowid, title, body)
SELECT activity_id, title, trim(coalesce(author, '') || ' ' || coalesce(review, '')) FROM activity_book;
