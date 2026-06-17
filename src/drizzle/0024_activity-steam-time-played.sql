ALTER TABLE `activity_steam` RENAME COLUMN "playtime_forever" TO "playtime_total";--> statement-breakpoint
CREATE INDEX `idx_steam_app_id` ON `activity_steam` (`app_id`);