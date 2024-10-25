PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_gallery_to_files` (
	`gallery_id` integer NOT NULL,
	`file_id` integer NOT NULL,
	PRIMARY KEY(`gallery_id`, `file_id`),
	FOREIGN KEY (`gallery_id`) REFERENCES `gallery`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_gallery_to_files`("gallery_id", "file_id") SELECT "gallery_id", "file_id" FROM `gallery_to_files`;--> statement-breakpoint
DROP TABLE `gallery_to_files`;--> statement-breakpoint
ALTER TABLE `__new_gallery_to_files` RENAME TO `gallery_to_files`;--> statement-breakpoint
PRAGMA foreign_keys=ON;