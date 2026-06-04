CREATE TABLE `bluesky_authors` (
	`did` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text,
	`avatar` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `activity_bluesky` ADD `author_did` text REFERENCES bluesky_authors(did);--> statement-breakpoint
ALTER TABLE `activity_bluesky` ADD `thread_posts` text;