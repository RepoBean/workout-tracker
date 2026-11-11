// Deterministic double-progression. No AI required.
//
// Judged on last session's sets at its HEAVIEST weight (ramp-up sets don't count). The bump is
// earned when set 1 there hit the TOP of the rep range (still double progression: work up the
// range first) and every one of those sets reached the GOAL: the bottom of the range plus the
// reps a set is expected to lose at the next weight (`repAllowance`, which grows with the size
// of the jump relative to the load). A 3% jump on a pin stack needs low + 1; a 14% dumbbell
// jump needs low + 2; a 50% jump (10 → 15 lb lateral raise) needs low + 8, which is PAST the
// top of the range — the target then keeps climbing instead of forcing a jump that fails.
// The C4 rule ("set 1 at the top, the rest merely in range") ignored jump size: over main's
// last six months 63% of the bumps it approved landed back in the range, this rule 71% while
// firing half as often (docs/v4-bundle-c4b-progression-v2.md §2). Otherwise keep the weight, unless the
// lift has stalled and fallen below the range: then suggest a 10% deload. Pure functions —
// session-time hint only, never mutates the program definition.
//
// The rep half of the suggestion is delegated to `suggestReps` so the pre-fill obeys one
// set of rules everywhere. This module keeps ownership of the WEIGHT decision.
//
// Assisted lifts (negative weight = assistance): −40 + 5 = −35 is "less help", which is exactly
// the progression, and −35 > −40 fires the rep reset. Only the jump SIZE needs the bodyweight
// (5 lb less help at 180 lb is 5/140); without one the allowance is the minimum.

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
  /** Current bodyweight, to size the jump on an assisted (negative-weight) lift. */
  bodyweight?: number | null;
}

export type ProgressionKind = 'up' | 'hold' | 'deload';

export interface ProgressionResult {
  kind: ProgressionKind;
  suggestedWeight: number;
  suggestedReps: number;
  /** True when the bump is earned (`kind === 'up'`). */
  ready: boolean;
  /** Reps every top-weight set needs before the weight goes up. May exceed the range's top. */
  goalReps: number;
  /** The weight the lift moves to once the goal is met (top + step). */
  nextWeight: number;
  /** Human-readable explanation, e.g. "Last: 100×12 → Try: 105 ↑". */
  reason: string;
}

/**
 * Reps a set is expected to lose per 100% of jump: allowance = round(jump × this), min 1.
 * Fixed by replaying main's history (bundle doc §2); 10–20 scored the same, 25 fired too rarely.
 */
export const REP_LOSS_PER_JUMP = 15;
/** The goal never climbs past this many reps; at the cap the bump is earned regardless. */
export const GOAL_REP_CAP = 30;

/**
 * Reps each set is expected to lose when `step` is added to `load` (the weight actually moved:
 * the bar weight, or bodyweight − assistance). No usable load → the minimum, 1.
 */
export function repAllowance(step: number, load: number): number {
  if (!(load > 0) || !(step > 0)) return 1;
  return Math.max(1, Math.round((step / load) * REP_LOSS_PER_JUMP));
}

/** Reps every top-weight set needs before `step` more is suggested. */
export function goalReps(low: number, step: number, load: number): number {
  return Math.max(low, Math.min(low + repAllowance(step, load), GOAL_REP_CAP));
}

/**
 * The step this lift has actually been moving in: the most common top-weight increase among
 * its last 5 bumps (ties → the most recent). Null without a bump. Offered in the step picker,
 * never applied on its own.
 */
export function learnedStep(history: ReadonlyMap<string, DayTop>): number | null {
  const days = [...history.keys()].sort().map((d) => history.get(d) as DayTop);
  const bumps: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const delta = Math.round((days[i].weight - days[i - 1].weight) * 100) / 100;
    if (delta > 0) bumps.push(delta);
  }
  const recent = bumps.slice(-5);
  let best: number | null = null;
  let bestCount = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const count = recent.filter((b) => b === recent[i]).length;
    if (count > bestCount) {
      best = recent[i];
      bestCount = count;
    }
  }
  return best;
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
  bodyweight,
}: ProgressionInput): ProgressionResult | null {
  const t = topSetsOf(previousSets);
  if (!t) return null;
  const { top, sets } = t;
  const { low, high } = parseRepTarget(targetReps);
  const bestReps = Math.max(...sets.map((s) => s.reps));

  const load = top > 0 ? top : top < 0 && bodyweight != null ? bodyweight + top : 0;
  const goal = goalReps(low, incrementLbs, load);
  const nextWeight = top + incrementLbs;
  const common = { goalReps: goal, nextWeight };

  // Earned the bump: set 1 at the top weight reached the top of the range and every set there
  // reached the goal (which may itself sit past the top).
  if (sets[0].reps >= high && sets.every((s) => s.reps >= goal)) {
    const suggestedWeight = nextWeight;
    return {
      ...common,
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
      repCeiling: Math.max(high, goal),
    });

  // Stalled (the coach's / Progress's 3-session flag) AND can't stay in the range any more.
  // Stalled alone isn't enough: on real data that flagged lifts sitting at the top of their
  // range, where the answer is more weight, not less.
  if (history && bestReps < low) {
    const stall = stallRun(history);
    const lighter = deloadWeight(top);
    if (stall.sessions >= STALL_SESSIONS && stall.weight === top && lighter < top) {
      return {
        ...common,
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
    ...common,
    kind: 'hold',
    suggestedWeight: top,
    suggestedReps: repsAt(top),
    ready: false,
    reason: goal < high
      ? `Aim ${formatWeight(top)}×${high} on set 1, rest ${goal}+ → then ${formatWeight(nextWeight)}`
      : `Aim ${formatWeight(top)}×${goal} on every set → then ${formatWeight(nextWeight)}`,
  };
}
