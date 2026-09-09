// Deterministic double-progression. No AI required.
//
// When every working set of the previous session hit the TOP of an exercise's
// rep range at the same weight, suggest bumping the weight by `incrementLbs` and
// reset the rep target to the bottom of the range. Otherwise keep the weight and
// aim for the top of the range. Pure functions — session-time hint only, never
// mutates the program definition.
//
// The rep half of the suggestion is delegated to `suggestReps` so the pre-fill obeys one
// set of rules everywhere. This module keeps ownership of the WEIGHT decision.

import { parseRepTarget, suggestReps } from './suggestReps';

export type { RepRange } from './suggestReps';
export { parseRepTarget } from './suggestReps';

export interface ProgressionInput {
  /**
   * Previous session's working sets for this exercise (standard sets only), in performed
   * order. `setNumber` is optional — callers that have it (PreviousSetData) should pass it;
   * otherwise position in the array is used.
   */
  previousSets: Array<{ weight: number; reps: number; dropIndex?: number; setNumber?: number }>;
  /** Exercise's target reps string, e.g. "8-12" or "5". */
  targetReps: string;
  /** How much to bump the weight when the range is topped out. */
  incrementLbs: number;
}

export interface ProgressionResult {
  suggestedWeight: number;
  suggestedReps: number;
  /** True when the bump is earned (range topped out on every set). */
  ready: boolean;
  /** Human-readable explanation, e.g. "Last: 100×12 → Try: 105 ↑". */
  reason: string;
}

/**
 * Compute the suggested next-session weight/reps from prior performance.
 * Returns null when there's no usable previous data.
 */
export function computeProgression({
  previousSets,
  targetReps,
  incrementLbs,
}: ProgressionInput): ProgressionResult | null {
  const working = previousSets.filter((s) => (s.dropIndex || 0) === 0);
  if (working.length === 0) return null;

  const { low, high } = parseRepTarget(targetReps);

  // All working sets at the same weight is the basis for a clean double-progression.
  const weight = working[0].weight;
  const sameWeight = working.every((s) => s.weight === weight);
  const topReps = Math.max(...working.map((s) => s.reps));

  // Earned the bump: every working set met or beat the top of the range at one weight.
  const toppedOut = sameWeight && working.every((s) => s.reps >= high);

  if (toppedOut) {
    const suggestedWeight = weight + incrementLbs;
    return {
      suggestedWeight,
      suggestedReps: low,
      ready: true,
      reason: `Last: ${weight}×${topReps} → Try: ${suggestedWeight} ↑`,
    };
  }

  // Not yet — keep the weight. The rep target stays the goal in the copy below, but the
  // PRE-FILL comes from `suggestReps`: aiming the input at `high` backtested worst of every
  // rule tried (set-1 MAE 2.32, 28% exact) because it ignores what actually happened.
  // Weight is unchanged in this branch, so this is exactly suggestReps for set 1.
  return {
    suggestedWeight: weight,
    suggestedReps: suggestReps({
      setNumber: 1,
      targetReps,
      previousSets: working.map((s, i) => ({
        setNumber: s.setNumber ?? i + 1,
        weight: s.weight,
        reps: s.reps,
      })),
      currentSessionSets: [],
      plannedWeight: weight,
    }),
    ready: false,
    reason: `Aim for ${weight}×${high} to level up`,
  };
}
