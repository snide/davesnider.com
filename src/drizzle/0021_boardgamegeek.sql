CREATE TABLE `activity_bgg` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`activity_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`play_date` text,
	`location` text,
	`num_players` integer,
	`comments` text,
	`incomplete` integer DEFAULT false,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade
);
