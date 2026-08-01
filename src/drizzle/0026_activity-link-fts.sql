-- Custom SQL migration file, put your code below! --

-- Link (bookmark) activity FTS: title + comment, mirroring the per-type
-- trigger pattern from 0020_activity-fts.sql
DROP TRIGGER IF EXISTS activity_link_fts_ai;
--> statement-breakpoint
CREATE TRIGGER activity_link_fts_ai AFTER INSERT ON activity_link BEGIN
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, new.comment);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_link_fts_au;
--> statement-breakpoint
CREATE TRIGGER activity_link_fts_au AFTER UPDATE ON activity_link BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (new.activity_id, new.title, new.comment);
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_link_fts_ad;
--> statement-breakpoint
CREATE TRIGGER activity_link_fts_ad AFTER DELETE ON activity_link BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
END;
--> statement-breakpoint
INSERT INTO activity_fts(rowid, title, body)
SELECT activity_id, title, comment FROM activity_link;
