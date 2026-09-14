import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { addColumnIfMissing, bootstrap, legacyColumns } from '../src/db/migrate.js';
import * as schema from '../src/db/schema.js';

// ---- Fixtures: the live schema, verbatim from sqlite_master on 2026-09-13 ----

// main instance (dropIndex etc. appended by ALTER TABLE; wife's column order
// differs, which is why the baseline must never compare shapes).
const LIVE_DDL = `
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
const PRE_LEGACY_DDL = `
CREATE TABLE \`Programs\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`name\` VARCHAR(255) NOT NULL, \`isActive\` TINYINT(1) DEFAULT 0, \`isArchived\` TINYINT(1) DEFAULT 0, \`currentWorkoutIndex\` INTEGER DEFAULT 0, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
CREATE TABLE \`Workouts\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`programId\` INTEGER NOT NULL REFERENCES \`Programs\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE, \`name\` VARCHAR(255) NOT NULL, \`orderIndex\` INTEGER NOT NULL, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
CREATE TABLE \`Exercises\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`workoutId\` INTEGER NOT NULL REFERENCES \`Workouts\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE, \`name\` VARCHAR(255) NOT NULL, \`targetSets\` INTEGER NOT NULL, \`targetReps\` VARCHAR(50) NOT NULL, \`orderIndex\` INTEGER NOT NULL, \`supersetGroup\` VARCHAR(1), \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
CREATE TABLE \`Sessions\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`programId\` INTEGER REFERENCES \`Programs\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE, \`programName\` VARCHAR(255) NOT NULL, \`workoutId\` INTEGER REFERENCES \`Workouts\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE, \`workoutName\` VARCHAR(255) NOT NULL, \`completedAt\` DATETIME, \`isAdHoc\` TINYINT(1) DEFAULT 0, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
CREATE TABLE \`Sets\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT, \`sessionId\` INTEGER NOT NULL REFERENCES \`Sessions\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE, \`exerciseId\` INTEGER REFERENCES \`Exercises\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE, \`exerciseName\` VARCHAR(255) NOT NULL, \`weight\` DECIMAL(6,2) NOT NULL, \`reps\` INTEGER NOT NULL, \`setNumber\` INTEGER NOT NULL, \`perceivedEffort\` INTEGER, \`createdAt\` DATETIME NOT NULL, \`updatedAt\` DATETIME NOT NULL);
`;

const TABLES = ['Programs', 'Workouts', 'Exercises', 'Sessions', 'Sets'];

const EXPECTED_COLUMNS: Record<string, string[]> = {
  Programs: ['id', 'name', 'isActive', 'isArchived', 'currentWorkoutIndex', 'createdAt', 'updatedAt'],
  Workouts: ['id', 'programId', 'name', 'orderIndex', 'createdAt', 'updatedAt'],
  Exercises: ['id', 'workoutId', 'name', 'targetSets', 'targetReps', 'orderIndex', 'supersetGroup',
    'exerciseType', 'cardioModality', 'targetDurationSec', 'targetDistance', 'createdAt', 'updatedAt'],
  Sessions: ['id', 'programId', 'programName', 'workoutId', 'workoutName', 'completedAt', 'isAdHoc',
    'heartRateAvg', 'heartRateMin', 'heartRateMax', 'heartRateSeries', 'exerciseNotes', 'createdAt', 'updatedAt'],
  Sets: ['id', 'sessionId', 'exerciseId', 'exerciseName', 'weight', 'reps', 'setNumber', 'perceivedEffort',
    'dropIndex', 'heartRateAvg', 'heartRateMax', 'durationSec', 'distance', 'createdAt', 'updatedAt'],
};

function columns(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map(c => c.name).sort();
}

function schemaObjects(db: Database.Database): Array<{ name: string; sql: string | null }> {
  return db.prepare(`SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') ORDER BY name`)
    .all() as Array<{ name: string; sql: string | null }>;
}

function appliedMigrations(db: Database.Database): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as { n: number }).n;
}

function fresh(ddl = '') {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  if (ddl) db.exec(ddl);
  return db;
}

describe('bootstrap on a fresh database', () => {
  it('creates all five tables with every column, records both migrations, and is idempotent', () => {
    const db = fresh();
    bootstrap(db);

    for (const t of TABLES) {
      expect(columns(db, t)).toEqual([...EXPECTED_COLUMNS[t]].sort());
    }
    expect(appliedMigrations(db)).toBe(2);
    const names = schemaObjects(db).map(o => o.name);
    expect(names).toContain('sets_exercise_name_lower');
    expect(names).toContain('sessions_completed_at');

    const before = schemaObjects(db);
    bootstrap(db);
    expect(schemaObjects(db)).toEqual(before);
    expect(appliedMigrations(db)).toBe(2);
  });
});

describe('bootstrap on the live (Sequelize-created) schema', () => {
  it('changes nothing except adding the migrations table and the new index', () => {
    const db = fresh(LIVE_DDL);
    const before = schemaObjects(db);

    bootstrap(db);

    const after = schemaObjects(db);
    const added = after
      .filter(o => !before.some(b => b.name === o.name))
      .map(o => o.name)
      .filter(n => !n.startsWith('sqlite_autoindex_')) // SQLite's own PK index on the migrations table
      .sort();
    expect(added).toEqual(['__drizzle_migrations', 'sets_exercise_name_lower']);
    // Every pre-existing object is byte-identical
    for (const b of before) {
      expect(after.find(a => a.name === b.name)?.sql).toBe(b.sql);
    }
    expect(appliedMigrations(db)).toBe(2);
  });

  it('reads and writes rows in the Sequelize date/boolean/json formats', () => {
    const sqlite = fresh(LIVE_DDL);
    bootstrap(sqlite);
    sqlite.exec(`INSERT INTO Programs (name, isActive, isArchived, currentWorkoutIndex, createdAt, updatedAt)
      VALUES ('Live', 1, 0, 2, '2026-01-29 16:42:55.246 +00:00', '2026-09-11 16:10:29.104 +00:00')`);
    sqlite.exec(`INSERT INTO Sessions (programId, programName, workoutName, completedAt, isAdHoc, exerciseNotes, createdAt, updatedAt)
      VALUES (1, 'Live', 'Push', '2026-09-11 16:10:29.104 +00:00', 0, '{"Neutral Grip Pull-Up":"Arms felt it mostly"}',
              '2026-09-11 15:00:00.000 +00:00', '2026-09-11 16:10:29.104 +00:00')`);

    const db = drizzle(sqlite, { schema });
    const program = db.select().from(schema.programs).get()!;
    expect(program.isActive).toBe(true);
    expect(program.isArchived).toBe(false);
    expect(program.createdAt.toISOString()).toBe('2026-01-29T16:42:55.246Z');

    const session = db.select().from(schema.sessions).get()!;
    expect(session.completedAt?.toISOString()).toBe('2026-09-11T16:10:29.104Z');
    expect(session.exerciseNotes).toEqual({ 'Neutral Grip Pull-Up': 'Arms felt it mostly' });

    // A row written through Drizzle lands in the exact storage format
    db.insert(schema.programs).values({
      name: 'New', createdAt: new Date('2026-09-14T12:00:00.000Z'), updatedAt: new Date('2026-09-14T12:00:00.000Z'),
    }).run();
    const raw = sqlite.prepare(`SELECT createdAt, isActive, typeof(isActive) AS t FROM Programs WHERE name = 'New'`).get() as
      { createdAt: string; isActive: number; t: string };
    expect(raw.createdAt).toBe('2026-09-14 12:00:00.000 +00:00');
    expect(raw.isActive).toBe(0);
    expect(raw.t).toBe('integer');
  });
});

describe('bootstrap on a pre-legacy-column database', () => {
  it('adds the 14 late columns, then the baseline is a no-op', () => {
    const db = fresh(PRE_LEGACY_DDL);
    expect(columns(db, 'Sets')).not.toContain('dropIndex');

    bootstrap(db);

    for (const t of TABLES) {
      expect(columns(db, t)).toEqual([...EXPECTED_COLUMNS[t]].sort());
    }
    expect(legacyColumns(db)).toEqual([]);
    expect(appliedMigrations(db)).toBe(2);
  });
});

describe('addColumnIfMissing', () => {
  it('adds a missing column once and reports the duplicate on retry', () => {
    const db = fresh('CREATE TABLE Scratch (id INTEGER PRIMARY KEY)');

    expect(addColumnIfMissing(db, 'Scratch', 'note TEXT')).toBe(true);
    expect(addColumnIfMissing(db, 'Scratch', 'note TEXT')).toBe(false);
  });

  it('rethrows errors that are not duplicate-column', () => {
    const db = fresh();
    expect(() => addColumnIfMissing(db, 'NoSuchTable', 'note TEXT')).toThrow();
  });
});
