-- Custom SQL migration file, put your code below! --

-- Flight activity FTS: title ("KPDX → KSEA") + airports/aircraft/route as the
-- body, mirroring the per-type trigger pattern from 0020_activity-fts.sql
DROP TRIGGER IF EXISTS activity_flight_fts_ai;
--> statement-breakpoint
CREATE TRIGGER activity_flight_fts_ai AFTER INSERT ON activity_flight BEGIN
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (
    new.activity_id,
    new.title,
    TRIM(
      COALESCE(new.origin_name, '') || ' ' || COALESCE(new.dest_name, '') || ' ' ||
      COALESCE(new.aircraft_title, '') || ' ' || COALESCE(new.aircraft_icao, '') || ' ' ||
      COALESCE(new.route_string, '')
    )
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_flight_fts_au;
--> statement-breakpoint
CREATE TRIGGER activity_flight_fts_au AFTER UPDATE ON activity_flight BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
  INSERT INTO activity_fts(rowid, title, body)
  VALUES (
    new.activity_id,
    new.title,
    TRIM(
      COALESCE(new.origin_name, '') || ' ' || COALESCE(new.dest_name, '') || ' ' ||
      COALESCE(new.aircraft_title, '') || ' ' || COALESCE(new.aircraft_icao, '') || ' ' ||
      COALESCE(new.route_string, '')
    )
  );
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_flight_fts_ad;
--> statement-breakpoint
CREATE TRIGGER activity_flight_fts_ad AFTER DELETE ON activity_flight BEGIN
  DELETE FROM activity_fts WHERE rowid = old.activity_id;
END;
--> statement-breakpoint
INSERT INTO activity_fts(rowid, title, body)
SELECT
  activity_id,
  title,
  TRIM(
    COALESCE(origin_name, '') || ' ' || COALESCE(dest_name, '') || ' ' ||
    COALESCE(aircraft_title, '') || ' ' || COALESCE(aircraft_icao, '') || ' ' ||
    COALESCE(route_string, '')
  )
FROM activity_flight;
