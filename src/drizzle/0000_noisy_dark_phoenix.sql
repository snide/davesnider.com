CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`google_url` text,
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
