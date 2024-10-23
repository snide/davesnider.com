PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fileId` text NOT NULL,
	`url` text,
	`original_upload_date` integer,
	`vision_label` text,
	`vision_image_properties` text,
	`dominant_color` text,
	`text_content` text,
	`vision_text` text,
	`focus_color` text,
	`file_type_category` text DEFAULT 'unknown' NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_files`("id", "fileId", "url", "original_upload_date", "vision_label", "vision_image_properties", "dominant_color", "text_content", "vision_text", "focus_color", "file_type_category", "is_hidden", "is_favorite") SELECT "id", "fileId", "url", "original_upload_date", "vision_label", "vision_image_properties", "dominant_color", "text_content", "vision_text", "focus_color", "file_type_category", "is_hidden", "is_favorite" FROM `files`;--> statement-breakpoint
DROP TABLE `files`;--> statement-breakpoint
ALTER TABLE `__new_files` RENAME TO `files`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `files_fileId_unique` ON `files` (`fileId`);--> statement-breakpoint
CREATE INDEX `idx_file_id` ON `files` (`fileId`);--> statement-breakpoint
CREATE INDEX `idx_original_upload_date` ON `files` (`original_upload_date`);--> statement-breakpoint
CREATE INDEX `idx_file_type_category` ON `files` (`file_type_category`);--> statement-breakpoint
CREATE INDEX `idx_is_hidden` ON `files` (`is_hidden`);--> statement-breakpoint
CREATE INDEX `idx_is_favorite` ON `files` (`is_favorite`);