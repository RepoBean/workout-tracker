// Realistic rep prefill for the set input.
//
// The old behaviour aimed at the TOP of the rep range on every fresh exercise
// (`computeProgression` returned `suggestedReps: high`), which backtested worst of
// every rule tried on real history — set-1 MAE 2.32, 28% exact. An 8-12 exercise
// prefilled 12 even when last session was 8/8/7.
//
// The rule here instead anchors on what actually happened last session, set by set,
// and only aims higher on set 1 — the one set where you're fresh. Backtested over
// 1103 real working sets: MAE 1.39, 55% within +/-1.
//
// Pure functions. This module owns `parseRepTarget`, which progression.ts re-exports —
// there must not be a second rep-target parser in this codebase. The dependency runs
// progression.ts -> suggestReps.ts and must stay one-directional.

export interface RepRange {
  low: number;
  high: number;
}

/**
 * Parse a target-reps string into a low/high range.
 * "8-12" -> {8,12}; "5" -> {5,5}; unparseable -> {10,10}.
 */
export function parseRepTarget(targetReps: string): RepRange {
  const matches = targetReps.match(/\d+/g);
  if (!matches || matches.length === 0) return { low: 10, high: 10 };
  const nums = matches.map((n) => parseInt(n, 10));
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  return { low, high };
}

/** A set with the fields this rule needs. Structurally satisfied by PreviousSetData and Set. */
export interface RepSetLike {
  setNumber: number;
  weight: number;
  reps: number;
}

export interface SuggestRepsInput {
  /** 1-based number of the set about to be logged. */
  setNumber: number;
  /** Raw target string from the Exercise, e.g. "8-12" or "12". */
  targetReps: string;
  /** Last completed session's standard sets for this exercise. */
  previousSets: RepSetLike[];
  /** Standard sets already logged for this exercise THIS session. */
  currentSessionSets: RepSetLike[];
  /** The weight the input is prefilled with — drives the double-progression reset. */
  plannedWeight: number;
}

/** Highest-numbered set in a list, or null. Order-independent: callers pass raw arrays. */
function lastBySetNumber(sets: RepSetLike[]): RepSetLike | null {
  let best: RepSetLike | null = null;
  for (const s of sets) {
    if (!best || s.setNumber > best.setNumber) best = s;
  }
  return best;
}

/**
 * Suggest a rep count for the set about to be logged.
 *
 * Rule precedence is normative — rules 4 and 6 can disagree, and this order is what
 * the tests encode:
 *   base (1) -> weight reset (2) -> set-1 bump (3) -> top clamp (6) -> decay cap (4)
 *
 * The decay cap applies last and can only ever pull a suggestion DOWN. Nothing may
 * push a set 2+ suggestion up to the bottom of the rep range.
 */
export function suggestReps({
  setNumber,
  targetReps,
  previousSets,
  currentSessionSets,
  plannedWeight,
}: SuggestRepsInput): number {
  const { low, high } = parseRepTarget(targetReps);
  const isFirstSet = setNumber <= 1;

  // The most recent set logged this session — the decay ceiling.
  const lastCurrent = lastBySetNumber(currentSessionSets);

  // 1. Base: last session's same-numbered set.
  // 5. Fallback: last session ran fewer sets, so use its final set.
  const base =
    previousSets.find((s) => s.setNumber === setNumber) ?? lastBySetNumber(previousSets);

  let reps: number;

  if (!base) {
    // 5. No previous session at all. Today's last set beats the raw target — which is
    //    what made set 4 jump back up at the most fatigued point.
    reps = isFirstSet ? low : lastCurrent?.reps ?? low;
  } else if (plannedWeight > base.weight) {
    // 2. Weight went up: this is the double-progression reset. Reps must not carry
    //    over from the lighter weight.
    reps = low;
  } else {
    reps = base.reps;
    // 3. Set-1 bump: fresh set, unchanged weight, room left in the range. Sets 2+ never
    //    bump — aim higher when fresh, stay honest when fatigued.
    if (isFirstSet && plannedWeight === base.weight && reps < high) {
      reps += 1;
    }
  }

  // 6. Clamp. Set 1 gets the full range. Sets 2+ get NO bottom floor: flooring them
  //    would inflate honest fatigue back up to target (last session's 8/6/6 on an 8-12
  //    exercise would prefill 9/8/8), contradicting rule 3.
  reps = isFirstSet ? Math.min(Math.max(reps, low), high) : Math.min(reps, high);

  // 4. Decay cap. Reps fall within a session; set 3 > set 2 is never right.
  if (!isFirstSet && lastCurrent) {
    reps = Math.min(reps, lastCurrent.reps);
  }

  return Math.max(1, Math.round(reps));
}
