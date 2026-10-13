CREATE TABLE `activity_book` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`title` text,
	`author` text,
	`thumbnail_url` text,
	`open_library_key` text,
	`open_library_url` text,
	`cover_id` integer,
	`year` integer,
	`format` text NOT NULL,
	`review` text,
	`rating` integer,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_book_activity_id` ON `activity_book` (`activity_id`);