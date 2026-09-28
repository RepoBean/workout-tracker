import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { addColumnIfMissing, bootstrap, legacyColumns } from '../src/db/migrate.js';
import * as schema from '../src/db/schema.js';
import { LIVE_DDL, PRE_LEGACY_DDL } from './fixtures/liveDdl.js';


const TABLES = ['Programs', 'Workouts', 'Exercises', 'Sessions', 'Sets', 'ExerciseCatalog'];
const MIGRATIONS = 4; // 0000 baseline, 0001 name index, 0002 catalog, 0003 catalog name index

const EXPECTED_COLUMNS: Record<string, string[]> = {
  Programs: ['id', 'name', 'isActive', 'isArchived', 'currentWorkoutIndex', 'createdAt', 'updatedAt'],
  Workouts: ['id', 'programId', 'name', 'orderIndex', 'createdAt', 'updatedAt'],
  Exercises: ['id', 'workoutId', 'name', 'targetSets', 'targetReps', 'orderIndex', 'supersetGroup',
    'exerciseType', 'cardioModality', 'targetDurationSec', 'targetDistance', 'createdAt', 'updatedAt', 'catalogId'],
  Sessions: ['id', 'programId', 'programName', 'workoutId', 'workoutName', 'completedAt', 'isAdHoc',
    'heartRateAvg', 'heartRateMin', 'heartRateMax', 'heartRateSeries', 'exerciseNotes', 'createdAt', 'updatedAt'],
  Sets: ['id', 'sessionId', 'exerciseId', 'exerciseName', 'weight', 'reps', 'setNumber', 'perceivedEffort',
    'dropIndex', 'heartRateAvg', 'heartRateMax', 'durationSec', 'distance', 'createdAt', 'updatedAt', 'catalogId'],
  ExerciseCatalog: ['id', 'name', 'aliases', 'createdAt', 'updatedAt'],
};

// What 0002's ALTER TABLE ... ADD appends to a table's stored DDL.
const withCatalogId = (ddl: string | null) =>
  ddl?.replace(/\)$/, ', `catalogId` integer REFERENCES ExerciseCatalog(id))');

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
  it('creates all six tables with every column, records every migration, and is idempotent', () => {
    const db = fresh();
    bootstrap(db);

    for (const t of TABLES) {
      expect(columns(db, t)).toEqual([...EXPECTED_COLUMNS[t]].sort());
    }
    expect(appliedMigrations(db)).toBe(MIGRATIONS);
    const names = schemaObjects(db).map(o => o.name);
    expect(names).toContain('sets_exercise_name_lower');
    expect(names).toContain('sessions_completed_at');
    expect(names).toEqual(expect.arrayContaining(['catalog_name_lower', 'exercises_catalog_id', 'sets_catalog_id']));

    const before = schemaObjects(db);
    bootstrap(db);
    expect(schemaObjects(db)).toEqual(before);
    expect(appliedMigrations(db)).toBe(MIGRATIONS);
  });
});

describe('bootstrap on the live (Sequelize-created) schema', () => {
  it('adds only the migrations table, the indexes, the catalog table and the two catalogId columns', () => {
    const db = fresh(LIVE_DDL);
    const before = schemaObjects(db);

    bootstrap(db);

    const after = schemaObjects(db);
    const added = after
      .filter(o => !before.some(b => b.name === o.name))
      .map(o => o.name)
      .filter(n => !n.startsWith('sqlite_autoindex_')) // SQLite's own PK index on the migrations table
      .sort();
    expect(added).toEqual([
      'ExerciseCatalog',
      '__drizzle_migrations',
      'catalog_name_lower',
      'exercises_catalog_id',
      'sets_catalog_id',
      'sets_exercise_name_lower',
    ]);
    // Sets and Exercises gain exactly the appended column; every other
    // pre-existing object is byte-identical.
    for (const b of before) {
      const expected = b.name === 'Sets' || b.name === 'Exercises' ? withCatalogId(b.sql) : b.sql;
      expect(after.find(a => a.name === b.name)?.sql).toBe(expected);
    }
    expect(appliedMigrations(db)).toBe(MIGRATIONS);
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
    expect(appliedMigrations(db)).toBe(MIGRATIONS);
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
