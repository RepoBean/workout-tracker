import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { bootstrap } from '../src/db/migrate.js';
import { backfillCatalog, findCatalogId, resolveCatalogId } from '../src/db/catalog.js';
import * as schema from '../src/db/schema.js';
import { LIVE_DDL } from './fixtures/liveDdl.js';

// Replays the live DDL, then a data fixture shaped like §1.1 of
// docs/v3-bundle-2-catalog.md: names only in Sets (null exerciseId, cardio),
// only in Exercises (archived test junk), in both; plus case / whitespace
// variants that don't exist live but the grouping rule must handle.

const TS = '2026-09-11 16:10:29.104 +00:00';

const FIXTURE = `
INSERT INTO Programs (id, name, isActive, isArchived, currentWorkoutIndex, createdAt, updatedAt) VALUES
  (1, 'Live', 1, 0, 0, '${TS}', '${TS}'),
  (2, 'Old', 0, 1, 0, '${TS}', '${TS}');
INSERT INTO Workouts (id, programId, name, orderIndex, createdAt, updatedAt) VALUES
  (1, 1, 'Upper', 0, '${TS}', '${TS}'),
  (2, 2, 'Upper', 0, '${TS}', '${TS}');
INSERT INTO Exercises (id, workoutId, name, targetSets, targetReps, orderIndex, createdAt, updatedAt) VALUES
  (1, 1, 'Low Incline DB Press', 3, '8-12', 0, '${TS}', '${TS}'),
  (2, 1, 'Leg Press', 3, '10', 1, '${TS}', '${TS}'),
  (3, 1, 'bicep curl', 3, '10', 2, '${TS}', '${TS}'),
  (4, 2, 'Low Incline Dumbbell Press', 3, '8-12', 0, '${TS}', '${TS}'),
  (5, 2, 'test1', 3, '10', 1, '${TS}', '${TS}'),
  (6, 2, 'Bicep Curl', 3, '10', 2, '${TS}', '${TS}');
INSERT INTO Sessions (id, programId, programName, workoutId, workoutName, completedAt, isAdHoc, createdAt, updatedAt) VALUES
  (1, 2, 'Old', 2, 'Upper', '${TS}', 0, '${TS}', '${TS}'),
  (2, 1, 'Live', 1, 'Upper', '${TS}', 0, '${TS}', '${TS}');
INSERT INTO Sets (id, sessionId, exerciseId, exerciseName, weight, reps, setNumber, createdAt, updatedAt, durationSec) VALUES
  (1, 1, 4, 'Low Incline Dumbbell Press', 60, 10, 1, '${TS}', '${TS}', NULL),
  (2, 1, 4, 'Low Incline Dumbbell Press', 60, 9, 2, '${TS}', '${TS}', NULL),
  (3, 1, NULL, 'Row', 100, 10, 1, '${TS}', '${TS}', NULL),
  (4, 2, 1, 'Low Incline DB Press', 65, 10, 1, '${TS}', '${TS}', NULL),
  (5, 2, 2, 'Leg Press', 200, 10, 1, '${TS}', '${TS}', NULL),
  (6, 2, 2, 'Leg Press', 200, 10, 2, '${TS}', '${TS}', NULL),
  (7, 2, NULL, ' Leg Press', 200, 10, 3, '${TS}', '${TS}', NULL),
  (8, 2, NULL, 'leg press', 200, 10, 4, '${TS}', '${TS}', NULL),
  (9, 2, NULL, 'Bicep Curl', 30, 10, 1, '${TS}', '${TS}', NULL),
  (10, 2, 3, 'bicep curl', 30, 10, 2, '${TS}', '${TS}', NULL),
  (11, 2, NULL, 'ROW', 100, 10, 2, '${TS}', '${TS}', NULL),
  (12, 2, NULL, 'Ride', 0, 0, 1, '${TS}', '${TS}', 1800);
`;

const NOTHING = { created: 0, sets: 0, exercises: 0, removed: 0 };

function liveDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(LIVE_DDL);
  sqlite.exec(FIXTURE);
  bootstrap(sqlite); // migrations, then the backfill
  return sqlite;
}

type Row = { id: number; name: string; aliases: string; createdAt: string; updatedAt: string };
const catalog = (sqlite: Database.Database) =>
  sqlite.prepare('SELECT id, name, aliases, createdAt, updatedAt FROM ExerciseCatalog ORDER BY id').all() as Row[];
const catalogName = (sqlite: Database.Database, id: number | null) =>
  (sqlite.prepare('SELECT name FROM ExerciseCatalog WHERE id = ?').get(id) as { name: string } | undefined)?.name;
const catalogIdOf = (sqlite: Database.Database, name: string) =>
  (sqlite.prepare('SELECT id FROM ExerciseCatalog WHERE name = ?').get(name) as { id: number }).id;
const setRows = (sqlite: Database.Database) =>
  sqlite.prepare('SELECT id, exerciseName, catalogId, updatedAt FROM Sets ORDER BY id').all() as
    Array<{ id: number; exerciseName: string; catalogId: number | null; updatedAt: string }>;
const exerciseRows = (sqlite: Database.Database) =>
  sqlite.prepare('SELECT id, name, catalogId, updatedAt FROM Exercises ORDER BY id').all() as
    Array<{ id: number; name: string; catalogId: number | null; updatedAt: string }>;
const addKept = (sqlite: Database.Database) => sqlite.exec(`INSERT INTO ExerciseCatalog (name, aliases, createdAt, updatedAt)
  VALUES ('Kept', '["Old Spelling"]', '${TS}', '${TS}')`);

describe('backfillCatalog on live-shaped data (run by bootstrap)', () => {
  it('creates one row per lower(trim(name)) across Sets and Exercises', () => {
    const sqlite = liveDb();
    expect(catalog(sqlite).map(r => r.name).sort()).toEqual([
      'Leg Press', 'Low Incline DB Press', 'Low Incline Dumbbell Press', 'Ride', 'Row', 'bicep curl', 'test1',
    ]);
    for (const r of catalog(sqlite)) {
      expect(r.aliases).toBe('[]');
      expect(r.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \+00:00$/);
    }
  });

  it('picks the canonical spelling: most sets, then a live program row, then lowest id', () => {
    const names = catalog(liveDb()).map(r => r.name);
    // "Leg Press" has 3 sets (incl. " Leg Press", trimmed) vs "leg press" 1
    expect(names).toContain('Leg Press');
    // "Bicep Curl" vs "bicep curl": 1 set each, both on Exercises rows — only
    // "bicep curl" is in a non-archived program
    expect(names).toContain('bicep curl');
    // "Row" vs "ROW": 1 set each, neither in a program — lowest set id
    expect(names).toContain('Row');
    expect(names).not.toContain('leg press');
    expect(names).not.toContain('Bicep Curl');
    expect(names).not.toContain('ROW');
  });

  it('resolves every Sets and Exercises row to the entry for its own name, touching nothing else', () => {
    const sqlite = liveDb();
    for (const s of setRows(sqlite)) {
      expect(s.catalogId).not.toBeNull();
      expect(catalogName(sqlite, s.catalogId)!.toLowerCase()).toBe(s.exerciseName.trim().toLowerCase());
      expect(s.updatedAt).toBe(TS);
    }
    for (const e of exerciseRows(sqlite)) {
      expect(e.catalogId).not.toBeNull();
      expect(catalogName(sqlite, e.catalogId)!.toLowerCase()).toBe(e.name.trim().toLowerCase());
      expect(e.updatedAt).toBe(TS);
    }
    expect(setRows(sqlite)[6].exerciseName).toBe(' Leg Press');
  });

  it('is idempotent: a second run changes nothing', () => {
    const sqlite = liveDb();
    const before = { cat: catalog(sqlite), sets: setRows(sqlite), ex: exerciseRows(sqlite) };
    expect(backfillCatalog(sqlite)).toEqual(NOTHING);
    expect({ cat: catalog(sqlite), sets: setRows(sqlite), ex: exerciseRows(sqlite) }).toEqual(before);
  });

  it('reports what the first boot did', () => {
    const sqlite = liveDb();
    sqlite.exec('UPDATE Sets SET catalogId = NULL; UPDATE Exercises SET catalogId = NULL; DELETE FROM ExerciseCatalog');
    expect(backfillCatalog(sqlite)).toEqual({ created: 7, sets: 12, exercises: 6, removed: 0 });
  });

  it('heals sets written by an old image (catalogId NULL), creating a row for an unknown name', () => {
    const sqlite = liveDb();
    const count = catalog(sqlite).length;
    sqlite.exec(`INSERT INTO Sets (sessionId, exerciseName, weight, reps, setNumber, createdAt, updatedAt)
      VALUES (2, 'Brand New Lift', 50, 10, 1, '${TS}', '${TS}'), (2, 'LEG PRESS', 200, 10, 5, '${TS}', '${TS}')`);

    expect(backfillCatalog(sqlite)).toEqual({ created: 1, sets: 2, exercises: 0, removed: 0 });
    expect(catalog(sqlite)).toHaveLength(count + 1);
    const [fresh, known] = setRows(sqlite).slice(-2);
    expect(catalogName(sqlite, fresh.catalogId)).toBe('Brand New Lift');
    expect(catalogName(sqlite, known.catalogId)).toBe('Leg Press');
  });

  it('GC removes unreferenced alias-less rows and keeps ones carrying aliases', () => {
    const sqlite = liveDb();
    sqlite.exec(`INSERT INTO ExerciseCatalog (name, aliases, createdAt, updatedAt) VALUES ('Typo', '[]', '${TS}', '${TS}')`);
    addKept(sqlite);

    expect(backfillCatalog(sqlite)).toEqual({ ...NOTHING, removed: 1 });
    const names = catalog(sqlite).map(r => r.name);
    expect(names).not.toContain('Typo');
    expect(names).toContain('Kept');
  });

  it('resolves null rows through an alias', () => {
    const sqlite = liveDb();
    addKept(sqlite);
    sqlite.exec(`INSERT INTO Sets (sessionId, exerciseName, weight, reps, setNumber, createdAt, updatedAt)
      VALUES (2, 'old spelling ', 50, 10, 1, '${TS}', '${TS}')`);

    expect(backfillCatalog(sqlite)).toEqual({ ...NOTHING, sets: 1 });
    expect(setRows(sqlite).at(-1)!.catalogId).toBe(catalogIdOf(sqlite, 'Kept'));
  });

  it('a fresh, empty database is a silent no-op', () => {
    const sqlite = new Database(':memory:');
    bootstrap(sqlite);
    expect(backfillCatalog(sqlite)).toEqual(NOTHING);
  });
});

describe('resolveCatalogId / findCatalogId', () => {
  it('matches by name case-insensitively and trimmed, by alias, else inserts', () => {
    const sqlite = liveDb();
    const db = drizzle(sqlite, { schema });
    addKept(sqlite);
    const count = catalog(sqlite).length;

    expect(resolveCatalogId(db, '  leg PRESS ')).toBe(catalogIdOf(sqlite, 'Leg Press'));
    expect(resolveCatalogId(db, 'OLD SPELLING')).toBe(catalogIdOf(sqlite, 'Kept'));
    expect(findCatalogId(db, 'Nope')).toBeNull();
    expect(catalog(sqlite)).toHaveLength(count);

    const created = resolveCatalogId(db, '  Cable Fly ');
    expect(catalogName(sqlite, created)).toBe('Cable Fly');
    expect(findCatalogId(db, 'cable fly')).toBe(created);
    expect(catalog(sqlite)).toHaveLength(count + 1);
  });

  it('works inside a transaction', () => {
    const sqlite = liveDb();
    const db = drizzle(sqlite, { schema });
    const id = db.transaction((tx) => resolveCatalogId(tx, 'Tx Lift'));
    expect(catalogName(sqlite, id)).toBe('Tx Lift');
  });
});
