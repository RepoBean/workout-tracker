// The live schema, verbatim from sqlite_master on 2026-09-13. Shared by the
// migration and catalog tests (both replay it rather than trust schema.ts).
// main instance (dropIndex etc. appended by ALTER TABLE; wife's column order
// differs, which is why the baseline must never compare shapes).
export const LIVE_DDL = `
CREATE TABLE \`Programs\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`name\` VARCHAR(255) NOT NULL, \`isActive\` TINYINT(1) DEFAULT 0, \`isArchived\` TINYINT(1) DEFAULT 0, \`currentWorkoutIndex\` INTEGER DEFAULT 0, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
CREATE TABLE \`Workouts\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`programId\` INTEGER NOT NULL REFERENCES \`Programs\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE, \`name\` VARCHAR(255) NOT NULL, \`orderIndex\` INTEGER NOT NULL, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
CREATE TABLE \`Exercises\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`workoutId\` INTEGER NOT NULL REFERENCES \`Workouts\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE, \`name\` VARCHAR(255) NOT NULL, \`targetSets\` INTEGER NOT NULL, \`targetReps\` VARCHAR(50) NOT NULL, \`orderIndex\` INTEGER NOT NULL, \`supersetGroup\` VARCHAR(1), \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL, exerciseType VARCHAR(16) NOT NULL DEFAULT 'strength', cardioModality VARCHAR(16), targetDurationSec INTEGER, targetDistance DECIMAL(6,2));
CREATE TABLE \`Sessions\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`programId\` INTEGER REFERENCES \`Programs\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE, \`programName\` VARCHAR(255) NOT NULL, \`workoutId\` INTEGER REFERENCES \`Workouts\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE, \`workoutName\` VARCHAR(255) NOT NULL, \`completedAt\` DATETIME, \`isAdHoc\` TINYINT(1) DEFAULT 0, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL, heartRateAvg INTEGER, heartRateMin INTEGER, heartRateMax INTEGER, heartRateSeries TEXT, exerciseNotes JSON);
CREATE TABLE \`Sets\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`sessionId\` INTEGER NOT NULL REFERENCES \`Sessions\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE, \`exerciseId\` INTEGER REFERENCES \`Exercises\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE, \`exerciseName\` VARCHAR(255) NOT NULL, \`weight\` DECIMAL(6,2) NOT NULL, \`reps\` INTEGER NOT NULL, \`setNumber\` INTEGER NOT NULL, \`perceivedEffort\` INTEGER, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL, dropIndex INTEGER NOT NULL DEFAULT 0, heartRateAvg INTEGER, heartRateMax INTEGER, durationSec INTEGER, distance DECIMAL(6,2));
CREATE INDEX \`exercises_workout_id_order_index\` ON \`Exercises\` (\`workoutId\`, \`orderIndex\`);
CREATE INDEX \`programs_is_active\` ON \`Programs\` (\`isActive\`);
CREATE INDEX \`programs_is_archived\` ON \`Programs\` (\`isArchived\`);
CREATE INDEX \`sessions_completed_at\` ON \`Sessions\` (\`completedAt\`);
CREATE INDEX \`sessions_program_id\` ON \`Sessions\` (\`programId\`);
CREATE INDEX \`sessions_program_id_workout_id\` ON \`Sessions\` (\`programId\`, \`workoutId\`);
CREATE INDEX \`sessions_workout_id\` ON \`Sessions\` (\`workoutId\`);
CREATE INDEX \`sets_exercise_id\` ON \`Sets\` (\`exerciseId\`);
CREATE INDEX \`sets_session_id\` ON \`Sets\` (\`sessionId\`);
CREATE INDEX \`sets_session_id_exercise_id\` ON \`Sets\` (\`sessionId\`, \`exerciseId\`);
CREATE INDEX \`workouts_program_id_order_index\` ON \`Workouts\` (\`programId\`, \`orderIndex\`);
`;

// The pre-June-2026 shape: launch-era sync() tables before the 14 legacy column adds.
export const PRE_LEGACY_DDL = `
CREATE TABLE \`Programs\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`name\` VARCHAR(255) NOT NULL, \`isActive\` TINYINT(1) DEFAULT 0, \`isArchived\` TINYINT(1) DEFAULT 0, \`currentWorkoutIndex\` INTEGER DEFAULT 0, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
CREATE TABLE \`Workouts\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`programId\` INTEGER NOT NULL REFERENCES \`Programs\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE, \`name\` VARCHAR(255) NOT NULL, \`orderIndex\` INTEGER NOT NULL, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
CREATE TABLE \`Exercises\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`workoutId\` INTEGER NOT NULL REFERENCES \`Workouts\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE, \`name\` VARCHAR(255) NOT NULL, \`targetSets\` INTEGER NOT NULL, \`targetReps\` VARCHAR(50) NOT NULL, \`orderIndex\` INTEGER NOT NULL, \`supersetGroup\` VARCHAR(1), \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
CREATE TABLE \`Sessions\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`programId\` INTEGER REFERENCES \`Programs\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE, \`programName\` VARCHAR(255) NOT NULL, \`workoutId\` INTEGER REFERENCES \`Workouts\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE, \`workoutName\` VARCHAR(255) NOT NULL, \`completedAt\` DATETIME, \`isAdHoc\` TINYINT(1) DEFAULT 0, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
CREATE TABLE \`Sets\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`sessionId\` INTEGER NOT NULL REFERENCES \`Sessions\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE, \`exerciseId\` INTEGER REFERENCES \`Exercises\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE, \`exerciseName\` VARCHAR(255) NOT NULL, \`weight\` DECIMAL(6,2) NOT NULL, \`reps\` INTEGER NOT NULL, \`setNumber\` INTEGER NOT NULL, \`perceivedEffort\` INTEGER, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
`;
