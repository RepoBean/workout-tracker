CREATE TABLE IF NOT EXISTS `Settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL
);
