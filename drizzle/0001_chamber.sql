CREATE TABLE `votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`member_id` text NOT NULL,
	`choice` text NOT NULL,
	`explanation` text NOT NULL,
	`weight` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `riksmote` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `number` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `final_tally` text;