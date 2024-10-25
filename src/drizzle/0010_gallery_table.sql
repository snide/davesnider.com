CREATE TABLE `gallery` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_name_unique` ON `gallery` (`name`);--> statement-breakpoint
CREATE TABLE `gallery_to_files` (
	`gallery_id` integer NOT NULL,
	`file_id` integer NOT NULL,
	PRIMARY KEY(`gallery_id`, `file_id`),
	FOREIGN KEY (`gallery_id`) REFERENCES `gallery`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
