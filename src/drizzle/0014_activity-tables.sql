CREATE TABLE `activity_bluesky` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`post_text` text NOT NULL,
	`is_reply` integer DEFAULT false NOT NULL,
	`reply_to_uri` text,
	`images` text,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
CREATE TABLE `activity_hackernews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`item_type` text NOT NULL,
	`body` text,
	`hn_score` integer,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity_plex` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`imdb_id` text,
	`imdb_url` text,
	`year` integer,
	`duration` integer,
	`review` text,
	`rating` integer,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity_reddit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`subreddit` text NOT NULL,
	`item_type` text NOT NULL,
	`body` text,
	`score` integer,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`external_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`thumbnail_url` text,
	`is_private` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_type` ON `activity` (`type`);--> statement-breakpoint
CREATE INDEX `idx_activity_timestamp` ON `activity` (`timestamp`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activity_type_external_id` ON `activity` (`type`,`external_id`);