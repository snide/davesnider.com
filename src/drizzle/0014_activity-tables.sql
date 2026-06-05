CREATE TABLE `activity_bgg` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`play_date` text,
	`location` text,
	`num_players` integer,
	`comments` text,
	`incomplete` integer DEFAULT false,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_bgg_activity_id` ON `activity_bgg` (`activity_id`);--> statement-breakpoint
CREATE TABLE `activity_bluesky` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`author_did` text,
	`post_text` text NOT NULL,
	`is_reply` integer DEFAULT false NOT NULL,
	`reply_to_uri` text,
	`root_uri` text,
	`images` text,
	`facets` text,
	`thread_posts` text,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_did`) REFERENCES `bluesky_authors`(`did`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_bluesky_activity_id` ON `activity_bluesky` (`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_bluesky_root_uri` ON `activity_bluesky` (`root_uri`);--> statement-breakpoint
CREATE TABLE `activity_github` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`repo` text NOT NULL,
	`ref` text,
	`pr_number` integer,
	`commit_sha` text,
	`commit_message` text,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_github_activity_id` ON `activity_github` (`activity_id`);--> statement-breakpoint
CREATE TABLE `activity_hackernews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`item_type` text NOT NULL,
	`body` text,
	`hn_score` integer,
	`comment_count` integer,
	`parent_id` integer,
	`root_id` integer,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_hackernews_activity_id` ON `activity_hackernews` (`activity_id`);--> statement-breakpoint
CREATE TABLE `activity_plex` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`imdb_id` text,
	`imdb_url` text,
	`year` integer,
	`duration` integer,
	`director` text,
	`review` text,
	`rating` integer,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_plex_activity_id` ON `activity_plex` (`activity_id`);--> statement-breakpoint
CREATE TABLE `activity_reddit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`subreddit` text NOT NULL,
	`item_type` text NOT NULL,
	`body` text,
	`score` integer,
	`edited_at` integer,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_reddit_activity_id` ON `activity_reddit` (`activity_id`);--> statement-breakpoint
CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`external_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`thumbnail_url` text,
	`is_private` integer DEFAULT false NOT NULL,
	`is_thread_root` integer DEFAULT true NOT NULL,
	`thread_latest_timestamp` integer,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_type` ON `activity` (`type`);--> statement-breakpoint
CREATE INDEX `idx_activity_timestamp` ON `activity` (`timestamp`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activity_type_external_id` ON `activity` (`type`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_activity_thread_feed` ON `activity` (`is_thread_root`,`thread_latest_timestamp`);--> statement-breakpoint
CREATE TABLE `bluesky_authors` (
	`did` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text,
	`avatar` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
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