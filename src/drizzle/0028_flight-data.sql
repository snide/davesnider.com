CREATE TABLE `activity_flight` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`title` text NOT NULL,
	`origin_icao` text NOT NULL,
	`origin_name` text,
	`dest_icao` text NOT NULL,
	`dest_name` text,
	`aircraft_title` text,
	`aircraft_icao` text,
	`departure_ts` integer NOT NULL,
	`arrival_ts` integer NOT NULL,
	`duration_sec` integer NOT NULL,
	`distance_nm` integer,
	`max_altitude_ft` integer,
	`landing_rate_fpm` integer,
	`route_string` text,
	`track` text,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_flight_activity_id` ON `activity_flight` (`activity_id`);