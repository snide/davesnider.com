CREATE INDEX `idx_bgg_activity_id` ON `activity_bgg` (`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_bluesky_activity_id` ON `activity_bluesky` (`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_bluesky_root_uri` ON `activity_bluesky` (`root_uri`);--> statement-breakpoint
CREATE INDEX `idx_github_activity_id` ON `activity_github` (`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_hackernews_activity_id` ON `activity_hackernews` (`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_plex_activity_id` ON `activity_plex` (`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_reddit_activity_id` ON `activity_reddit` (`activity_id`);