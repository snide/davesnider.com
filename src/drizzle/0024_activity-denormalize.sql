ALTER TABLE `activity` ADD `is_thread_root` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `activity` ADD `thread_latest_timestamp` integer;--> statement-breakpoint
CREATE INDEX `idx_activity_thread_feed` ON `activity` (`is_thread_root`,`thread_latest_timestamp`);