import type { Exercise } from '../../../shared/api/types';

/**
 * Build a synthetic `Exercise` for an ad-hoc / swap insert into the
 * active session. Callers supply at minimum an `id` and `name` and may
 * override any other field (e.g. to copy `targetSets` / `supersetGroup`
 * from a source exercise being swapped, or to set `exerciseType: 'cardio'`
 * for an ad-hoc cardio entry).
 *
 * The id-derivation strategy is the caller's responsibility — different
 * call sites use different conventions (`-Date.now()` vs a deterministic
 * hash of `tempId`) — so this factory does not generate one.
 */
export function makeVirtualExercise(
  overrides: Partial<Exercise> & { id: number; name: string },
): Exercise {
  const now = new Date().toISOString();
  return {
    workoutId: 0,
    targetSets: 3,
    targetReps: '10',
    orderIndex: 0,
    supersetGroup: null,
    exerciseType: 'strength',
    cardioModality: null,
    targetDurationSec: null,
    targetDistance: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
