import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '../index.js';
import { sessions, sets } from '../schema.js';

// Case-insensitive exercise-name lookups over logged sets. Backed by the
// expression index sets_exercise_name_lower (migration 0001). Replaces the old
// "load every set in the database, then filter by name in JS" path.

const nameMatches = (name: string) => sql`lower(${sets.exerciseName}) = lower(${name})`;

const standardCompleted = (name: string) => and(
  eq(sets.dropIndex, 0),
  isNotNull(sessions.completedAt),
  nameMatches(name),
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
 */
export function latestSetsByName(name: string): { completedAt: Date; sets: HintSet[] } | null {
  const latest = db
    .select({ sessionId: sets.sessionId, completedAt: sessions.completedAt })
    .from(sets)
    .innerJoin(sessions, eq(sets.sessionId, sessions.id))
    .where(standardCompleted(name))
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
    .where(and(eq(sets.sessionId, latest.sessionId), eq(sets.dropIndex, 0), nameMatches(name)))
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
    .where(standardCompleted(name))
    .orderBy(desc(sessions.completedAt), asc(sets.setNumber))
    .all();
}
