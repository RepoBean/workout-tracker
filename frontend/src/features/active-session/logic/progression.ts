// Deterministic double-progression. No AI required.
//
// Judged on last session's sets at its HEAVIEST weight (ramp-up sets don't count). When set 1
// there hit the TOP of the rep range and every one of them stayed IN the range, suggest
// `incrementLbs` more and reset the rep target to the bottom of the range. At RPE 9 the last
// set fades 2-4 reps, so "every set at the top" (the pre-C4 rule) almost never fired: replayed
// over main's history it suggested a bump 54 times while the lifter went up 95 times; this rule
// fires 114 (docs/v4-bundle-c4-progression.md §2). Otherwise keep the weight, unless the lift
// has stalled and fallen below the range: then suggest a 10% deload. Pure functions —
// session-time hint only, never mutates the program definition.
//
// The rep half of the suggestion is delegated to `suggestReps` so the pre-fill obeys one
// set of rules everywhere. This module keeps ownership of the WEIGHT decision.
//
// Assisted lifts (negative weight = assistance) need no special case: −40 + 5 = −35 is
// "less help", which is exactly the progression, and −35 > −40 fires the rep reset.

import { parseRepTarget, suggestReps } from './suggestReps';
import { formatWeight } from '../../../shared/utils/format';
import { STALL_SESSIONS, addToDayTop, stallRun, type DayTop } from '../../../shared/lib/liftTrend';
import { localDateKey } from '../../../shared/lib/localDate';

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
  /** How much to bump the weight (the exercise's own step, else the global setting). */
  incrementLbs: number;
  /**
   * The lift's dated history (one DayTop per local date, raw signed weight), for the deload.
   * Omit it and there is no deload branch — callers only fetch it when it could matter
   * (see `couldDeload`).
   */
  history?: ReadonlyMap<string, DayTop>;
}

export type ProgressionKind = 'up' | 'hold' | 'deload';

export interface ProgressionResult {
  kind: ProgressionKind;
  suggestedWeight: number;
  suggestedReps: number;
  /** True when the bump is earned (`kind === 'up'`). */
  ready: boolean;
  /** Human-readable explanation, e.g. "Last: 100×12 → Try: 105 ↑". */
  reason: string;
}

/** Deload size: 10% of the stalled weight. */
export const DELOAD_FRACTION = 0.1;
const DELOAD_ROUND_LBS = 5;

/**
 * `w` minus 10% of |w|, to the nearest 5 lb, ties going lighter (225 → 200, 145 → 130,
 * assisted −30 → −35). A light lift rounds back to `w` (10 → 9 → 10): no deload.
 */
export function deloadWeight(w: number): number {
  const target = (w - DELOAD_FRACTION * Math.abs(w)) / DELOAD_ROUND_LBS;
  // Nearest step, ties down: ceil(x − 0.5). Round the quotient first so float noise
  // (40.50000000001) can't flip a tie.
  const rounded = Math.ceil(Math.round(target * 1e6) / 1e6 - 0.5) * DELOAD_ROUND_LBS;
  return rounded >= w ? w : rounded;
}

interface TopSets {
  top: number;
  sets: Array<{ weight: number; reps: number; setNumber: number }>;
}

function topSetsOf(previousSets: ProgressionInput['previousSets']): TopSets | null {
  const working = previousSets
    .filter((s) => (s.dropIndex || 0) === 0)
    .map((s, i) => ({ weight: s.weight, reps: s.reps, setNumber: s.setNumber ?? i + 1 }))
    .sort((a, b) => a.setNumber - b.setNumber);
  if (working.length === 0) return null;
  const top = Math.max(...working.map((s) => s.weight));
  return { top, sets: working.filter((s) => s.weight === top) };
}

/**
 * A lift's all-time sets (`/exercises/all-sets-by-name`) → one DayTop per local date, on the
 * RAW signed weight (the progression works in entered weight, like the hint itself).
 */
export function historyFromSets(
  sets: ReadonlyArray<{ weight: number; reps: number; dropIndex: number; durationSec?: number | null; completedAt: string | null }>,
): Map<string, DayTop> {
  const byDate = new Map<string, DayTop>();
  for (const s of sets) {
    if (!s.completedAt || s.dropIndex > 0 || s.reps <= 0 || s.durationSec) continue;
    const date = localDateKey(s.completedAt);
    byDate.set(date, addToDayTop(byDate.get(date), s.weight, s.reps));
  }
  return byDate;
}

/**
 * Whether the deload branch could fire for these previous sets — i.e. whether the caller
 * should fetch the lift's history at all. Below the range at the top weight.
 */
export function couldDeload(previousSets: ProgressionInput['previousSets'], targetReps: string): boolean {
  const t = topSetsOf(previousSets);
  if (!t) return false;
  const { low } = parseRepTarget(targetReps);
  return Math.max(...t.sets.map((s) => s.reps)) < low;
}

/**
 * Compute the suggested next-session weight/reps from prior performance.
 * Returns null when there's no usable previous data.
 */
export function computeProgression({
  previousSets,
  targetReps,
  incrementLbs,
  history,
}: ProgressionInput): ProgressionResult | null {
  const t = topSetsOf(previousSets);
  if (!t) return null;
  const { top, sets } = t;
  const { low, high } = parseRepTarget(targetReps);
  const bestReps = Math.max(...sets.map((s) => s.reps));

  // Earned the bump: set 1 at the top weight reached the top of the range, none fell out of it.
  if (sets[0].reps >= high && sets.every((s) => s.reps >= low)) {
    const suggestedWeight = top + incrementLbs;
    return {
      kind: 'up',
      suggestedWeight,
      suggestedReps: low,
      ready: true,
      reason: `Last: ${formatWeight(top)}×${sets[0].reps} → Try: ${formatWeight(suggestedWeight)} ↑`,
    };
  }

  const repsAt = (plannedWeight: number) =>
    suggestReps({
      setNumber: 1,
      targetReps,
      previousSets: previousSets
        .filter((s) => (s.dropIndex || 0) === 0)
        .map((s, i) => ({ setNumber: s.setNumber ?? i + 1, weight: s.weight, reps: s.reps })),
      currentSessionSets: [],
      plannedWeight,
    });

  // Stalled (the coach's / Progress's 3-session flag) AND can't stay in the range any more.
  // Stalled alone isn't enough: on real data that flagged lifts sitting at the top of their
  // range, where the answer is more weight, not less.
  if (history && bestReps < low) {
    const stall = stallRun(history);
    const lighter = deloadWeight(top);
    if (stall.sessions >= STALL_SESSIONS && stall.weight === top && lighter < top) {
      return {
        kind: 'deload',
        suggestedWeight: lighter,
        suggestedReps: repsAt(lighter),
        ready: false,
        reason: `Stuck at ${formatWeight(top)} for ${stall.sessions} sessions → Try: ${formatWeight(lighter)} ↓`,
      };
    }
  }

  // Not yet — keep the weight. The goal is in the copy, but the PRE-FILL comes from
  // `suggestReps`: aiming the input at `high` backtested worst of every rule tried (set-1
  // MAE 2.32, 28% exact) because it ignores what actually happened.
  return {
    kind: 'hold',
    suggestedWeight: top,
    suggestedReps: repsAt(top),
    ready: false,
    reason: low < high
      ? `Aim for ${formatWeight(top)}×${high} on set 1, rest ${low}+ to go up`
      : `Aim for ${formatWeight(top)}×${high} on every set to go up`,
  };
}
