CREATE TABLE `og_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`description` text,
	`image` text,
	`site_name` text,
	`fetched_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `og_cache_url_unique` ON `og_cache` (`url`);--> statement-breakpoint
CREATE INDEX `idx_og_cache_url` ON `og_cache` (`url`);