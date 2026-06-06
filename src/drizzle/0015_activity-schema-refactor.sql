ALTER TABLE `activity_bgg` ADD `title` text;--> statement-breakpoint
ALTER TABLE `activity_bgg` ADD `thumbnail_url` text;--> statement-breakpoint
ALTER TABLE `activity_bluesky` ADD `title` text;--> statement-breakpoint
ALTER TABLE `activity_github` ADD `title` text;--> statement-breakpoint
ALTER TABLE `activity_github` ADD `url` text;--> statement-breakpoint
ALTER TABLE `activity_hackernews` ADD `title` text;--> statement-breakpoint
ALTER TABLE `activity_hackernews` ADD `url` text;--> statement-breakpoint
ALTER TABLE `activity_plex` ADD `title` text;--> statement-breakpoint
ALTER TABLE `activity_plex` ADD `thumbnail_url` text;--> statement-breakpoint
ALTER TABLE `activity_reddit` ADD `title` text;--> statement-breakpoint
ALTER TABLE `activity_reddit` ADD `url` text;--> statement-breakpoint

-- Copy data from activity to subtables
UPDATE activity_plex SET
  title = (SELECT title FROM activity WHERE activity.id = activity_plex.activity_id),
  thumbnail_url = (SELECT thumbnail_url FROM activity WHERE activity.id = activity_plex.activity_id);--> statement-breakpoint
UPDATE activity_github SET
  title = (SELECT title FROM activity WHERE activity.id = activity_github.activity_id),
  url = (SELECT url FROM activity WHERE activity.id = activity_github.activity_id);--> statement-breakpoint
UPDATE activity_bluesky SET
  title = (SELECT title FROM activity WHERE activity.id = activity_bluesky.activity_id);--> statement-breakpoint
UPDATE activity_reddit SET
  title = (SELECT title FROM activity WHERE activity.id = activity_reddit.activity_id),
  url = (SELECT url FROM activity WHERE activity.id = activity_reddit.activity_id);--> statement-breakpoint
UPDATE activity_hackernews SET
  title = (SELECT title FROM activity WHERE activity.id = activity_hackernews.activity_id),
  url = (SELECT url FROM activity WHERE activity.id = activity_hackernews.activity_id);--> statement-breakpoint
UPDATE activity_bgg SET
  title = (SELECT title FROM activity WHERE activity.id = activity_bgg.activity_id),
  thumbnail_url = (SELECT thumbnail_url FROM activity WHERE activity.id = activity_bgg.activity_id);--> statement-breakpoint

ALTER TABLE `activity` DROP COLUMN `title`;--> statement-breakpoint
ALTER TABLE `activity` DROP COLUMN `url`;--> statement-breakpoint
ALTER TABLE `activity` DROP COLUMN `thumbnail_url`;