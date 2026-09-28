CREATE TABLE `ExerciseCatalog` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL
);
--> statement-breakpoint
ALTER TABLE `Exercises` ADD `catalogId` integer REFERENCES ExerciseCatalog(id);--> statement-breakpoint
CREATE INDEX `exercises_catalog_id` ON `Exercises` (`catalogId`);--> statement-breakpoint
ALTER TABLE `Sets` ADD `catalogId` integer REFERENCES ExerciseCatalog(id);--> statement-breakpoint
CREATE INDEX `sets_catalog_id` ON `Sets` (`catalogId`);