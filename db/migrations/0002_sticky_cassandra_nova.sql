ALTER TABLE `tasks` ADD `type` text DEFAULT 'as_needed' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `due_date` integer;--> statement-breakpoint
UPDATE `tasks` SET `type` = 'scheduled' WHERE `interval_days` IS NOT NULL;
