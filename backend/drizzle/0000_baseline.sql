CREATE TABLE IF NOT EXISTS `Exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workoutId` integer NOT NULL,
	`name` text NOT NULL,
	`targetSets` integer NOT NULL,
	`targetReps` text NOT NULL,
	`orderIndex` integer NOT NULL,
	`supersetGroup` text,
	`exerciseType` text DEFAULT 'strength' NOT NULL,
	`cardioModality` text,
	`targetDurationSec` integer,
	`targetDistance` real,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	FOREIGN KEY (`workoutId`) REFERENCES `Workouts`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `exercises_workout_id_order_index` ON `Exercises` (`workoutId`,`orderIndex`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`isActive` integer DEFAULT false NOT NULL,
	`isArchived` integer DEFAULT false NOT NULL,
	`currentWorkoutIndex` integer DEFAULT 0 NOT NULL,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `programs_is_active` ON `Programs` (`isActive`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `programs_is_archived` ON `Programs` (`isArchived`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`programId` integer,
	`programName` text NOT NULL,
	`workoutId` integer,
	`workoutName` text NOT NULL,
	`completedAt` DATETIME,
	`isAdHoc` integer DEFAULT false NOT NULL,
	`heartRateAvg` integer,
	`heartRateMin` integer,
	`heartRateMax` integer,
	`heartRateSeries` text,
	`exerciseNotes` text,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	FOREIGN KEY (`programId`) REFERENCES `Programs`(`id`) ON UPDATE cascade ON DELETE set null,
	FOREIGN KEY (`workoutId`) REFERENCES `Workouts`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_program_id` ON `Sessions` (`programId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_workout_id` ON `Sessions` (`workoutId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_completed_at` ON `Sessions` (`completedAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_program_id_workout_id` ON `Sessions` (`programId`,`workoutId`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sessionId` integer NOT NULL,
	`exerciseId` integer,
	`exerciseName` text NOT NULL,
	`weight` real NOT NULL,
	`reps` integer NOT NULL,
	`setNumber` integer NOT NULL,
	`perceivedEffort` integer,
	`dropIndex` integer DEFAULT 0 NOT NULL,
	`heartRateAvg` integer,
	`heartRateMax` integer,
	`durationSec` integer,
	`distance` real,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	FOREIGN KEY (`sessionId`) REFERENCES `Sessions`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`exerciseId`) REFERENCES `Exercises`(`id`) ON UPDATE cascade ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sets_session_id` ON `Sets` (`sessionId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sets_exercise_id` ON `Sets` (`exerciseId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sets_session_id_exercise_id` ON `Sets` (`sessionId`,`exerciseId`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `Workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`programId` integer NOT NULL,
	`name` text NOT NULL,
	`orderIndex` integer NOT NULL,
	`createdAt` DATETIME NOT NULL,
	`updatedAt` DATETIME NOT NULL,
	FOREIGN KEY (`programId`) REFERENCES `Programs`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `workouts_program_id_order_index` ON `Workouts` (`programId`,`orderIndex`);