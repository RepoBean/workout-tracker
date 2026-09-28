import type { Database } from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import type { Db, Tx } from './index.js';
import { exerciseCatalog } from './schema.js';
import { toStorage } from './columns.js';

/**
 * The exercise catalog: one row per lift, keyed case-insensitively by name, with
 * aliases that merges leave behind. Names stay on every Exercises/Sets row and are
 * authoritative — catalogId is always derived from them, never accepted from a client.
 *
 *  - resolveCatalogId(): write path. Name → id, inserting a row for a new name.
 *  - findCatalogId():    read path. Same lookup, never inserts.
 *  - backfillCatalog():  every boot. Fills catalogId on rows that lack it (first
 *    boot, or rows an older image wrote during a rollback) and drops unreferenced,
 *    alias-less rows. Idempotent; silent on a converged database.
 */

type Conn = Db | Tx;

// Name first, then any alias. lower(name) hits the catalog_name_lower index.
const lookup = (name: string) => sql`
  SELECT id FROM (
    SELECT id, 0 AS rank FROM ExerciseCatalog WHERE lower(name) = lower(${name})
    UNION ALL
    SELECT c.id, 1 AS rank FROM ExerciseCatalog c, json_each(c.aliases) a
      WHERE lower(trim(a.value)) = lower(${name})
  ) ORDER BY rank LIMIT 1`;

export function findCatalogId(conn: Conn, rawName: string): number | null {
  return conn.get<{ id: number } | undefined>(lookup(rawName.trim()))?.id ?? null;
}

export function resolveCatalogId(conn: Conn, rawName: string): number {
  const name = rawName.trim();
  const found = findCatalogId(conn, name);
  if (found !== null) return found;
  const ts = new Date();
  return conn.insert(exerciseCatalog)
    .values({ name, aliases: [], createdAt: ts, updatedAt: ts })
    .returning({ id: exerciseCatalog.id })
    .get().id;
}

export interface BackfillResult {
  created: number;
  sets: number;
  exercises: number;
  removed: number;
}

// Correlated "resolve this row's name" subquery for the UPDATEs, same order as lookup().
const resolveColumn = (column: string) => `(
  SELECT id FROM (
    SELECT id, 0 AS rank FROM ExerciseCatalog WHERE lower(name) = lower(trim(${column}))
    UNION ALL
    SELECT c.id, 1 AS rank FROM ExerciseCatalog c, json_each(c.aliases) a
      WHERE lower(trim(a.value)) = lower(trim(${column}))
  ) ORDER BY rank LIMIT 1)`;

/**
 * 1. One catalog row per distinct lower(trim(name)) among unresolved Sets/Exercises
 *    rows that no catalog name or alias covers yet. Canonical spelling: most Sets
 *    rows; tie → on an Exercises row in a non-archived program; tie → lowest id.
 * 2. Fill catalogId where NULL (name, else alias).
 * 3. GC rows referenced by nothing and carrying no aliases.
 * Never touches names or any row's updatedAt.
 */
export function backfillCatalog(sqlite: Database): BackfillResult {
  const ts = toStorage(new Date());
  return sqlite.transaction((): BackfillResult => {
    const created = sqlite.prepare(`
      WITH spellings AS (
        SELECT trim(exerciseName) AS name, 1 AS isSet, 0 AS isLive, id AS setId, NULL AS exerciseId
          FROM Sets WHERE catalogId IS NULL
        UNION ALL
        SELECT trim(e.name), 0, CASE WHEN p.isArchived = 0 THEN 1 ELSE 0 END, NULL, e.id
          FROM Exercises e
          JOIN Workouts w ON w.id = e.workoutId
          JOIN Programs p ON p.id = w.programId
          WHERE e.catalogId IS NULL
      ),
      ranked AS (
        SELECT name, ROW_NUMBER() OVER (
          PARTITION BY lower(name)
          ORDER BY sum(isSet) DESC, max(isLive) DESC,
                   min(setId) IS NULL, min(setId), min(exerciseId)
        ) AS pick
        FROM spellings
        WHERE name <> ''
        GROUP BY name
      )
      INSERT INTO ExerciseCatalog (name, aliases, createdAt, updatedAt)
      SELECT name, '[]', @ts, @ts FROM ranked r
      WHERE pick = 1
        AND NOT EXISTS (SELECT 1 FROM ExerciseCatalog c WHERE lower(c.name) = lower(r.name))
        AND NOT EXISTS (SELECT 1 FROM ExerciseCatalog c, json_each(c.aliases) a
                        WHERE lower(trim(a.value)) = lower(r.name))
    `).run({ ts }).changes;

    // The IS NOT NULL guard keeps an unresolvable row (blank name) from counting
    // as a change on every boot.
    const fill = (table: string, column: string) => {
      const resolved = resolveColumn(`${table}.${column}`);
      return sqlite.prepare(
        `UPDATE ${table} SET catalogId = ${resolved} WHERE catalogId IS NULL AND ${resolved} IS NOT NULL`
      ).run().changes;
    };
    const sets = fill('Sets', 'exerciseName');
    const exercises = fill('Exercises', 'name');

    const removed = sqlite.prepare(`
      DELETE FROM ExerciseCatalog
      WHERE json_array_length(aliases) = 0
        AND NOT EXISTS (SELECT 1 FROM Sets s WHERE s.catalogId = ExerciseCatalog.id)
        AND NOT EXISTS (SELECT 1 FROM Exercises e WHERE e.catalogId = ExerciseCatalog.id)
    `).run().changes;

    return { created, sets, exercises, removed };
  })();
}
