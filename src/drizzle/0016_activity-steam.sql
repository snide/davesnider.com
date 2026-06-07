CREATE TABLE `activity_steam` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`app_id` integer NOT NULL,
	`game_title` text NOT NULL,
	`game_header_url` text,
	`game_year` integer,
	`game_developer` text,
	`achievements` text,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_steam_activity_id` ON `activity_steam` (`activity_id`);