CREATE TABLE `activity_link` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`link_id` integer NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`comment` text,
	`tags` text,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_link_activity_id` ON `activity_link` (`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_link_link_id` ON `activity_link` (`link_id`);