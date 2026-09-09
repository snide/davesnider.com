ALTER TABLE `activity_flight` ADD `trip` text;--> statement-breakpoint
ALTER TABLE `activity_flight` ADD `trip_stop` text;--> statement-breakpoint
CREATE INDEX `idx_flight_trip` ON `activity_flight` (`trip`);