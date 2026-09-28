import { and, asc, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm';
import { db } from '../index.js';
import { sessions, sets } from '../schema.js';
import { findCatalogId } from '../catalog.js';

// Exercise-name lookups over logged sets, by catalog identity: the name (or an
// alias a merge left behind) resolves to a catalog row and the sets are matched on
// catalogId (index sets_catalog_id), so a merged lift answers as one lift under
// either spelling. A name the catalog doesn't know falls back to the old
// case-insensitive name equality (expression index sets_exercise_name_lower).

function exerciseMatches(name: string, catalogId?: number | null): SQL {
  const id = catalogId ?? findCatalogId(db, name);
  return id !== null ? eq(sets.catalogId, id) : sql`lower(${sets.exerciseName}) = lower(${name})`;
}

const standardCompleted = (match: SQL) => and(
  eq(sets.dropIndex, 0),
  isNotNull(sessions.completedAt),
  match,
);

export interface HintSet {
  setNumber: number;
  weight: number;
  reps: number;
  perceivedEffort: number | null;
}

/**
 * The most recent completed session's standard sets for an exercise name —
 * the "what did I do last time" hint. Null when the name has never been logged.
 * Pass the row's catalogId when the caller has it (/previous) to skip the lookup.
 */
export function latestSetsByName(
  name: string,
  catalogId?: number | null,
): { completedAt: Date; sets: HintSet[] } | null {
  const match = exerciseMatches(name, catalogId);
  const latest = db
    .select({ sessionId: sets.sessionId, completedAt: sessions.completedAt })
    .from(sets)
    .innerJoin(sessions, eq(sets.sessionId, sessions.id))
    .where(standardCompleted(match))
    .orderBy(desc(sessions.completedAt))
    .limit(1)
    .get();

  if (!latest || !latest.completedAt) return null;

  const rows = db
    .select({
      setNumber: sets.setNumber,
      weight: sets.weight,
      reps: sets.reps,
      perceivedEffort: sets.perceivedEffort,
    })
    .from(sets)
    .where(and(eq(sets.sessionId, latest.sessionId), eq(sets.dropIndex, 0), match))
    .orderBy(asc(sets.setNumber))
    .all();

  return { completedAt: latest.completedAt, sets: rows };
}

/**
 * Every standard set for an exercise name across all completed sessions,
 * newest session first — the all-time PR check.
 */
export function allStandardSetsByName(name: string) {
  return db
    .select({
      weight: sets.weight,
      reps: sets.reps,
      dropIndex: sets.dropIndex,
      durationSec: sets.durationSec,
      distance: sets.distance,
      completedAt: sessions.completedAt,
    })
    .from(sets)
    .innerJoin(sessions, eq(sets.sessionId, sessions.id))
    .where(standardCompleted(exerciseMatches(name)))
    .orderBy(desc(sessions.completedAt), asc(sets.setNumber))
    .all();
}
