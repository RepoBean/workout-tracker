// Deterministic double-progression. No AI required.
//
// When every working set of the previous session hit the TOP of an exercise's
// rep range at the same weight, suggest bumping the weight by `incrementLbs` and
// reset the rep target to the bottom of the range. Otherwise keep the weight and
// aim for the top of the range. Pure functions — session-time hint only, never
// mutates the program definition.

export interface RepRange {
  low: number;
  high: number;
}

export interface ProgressionInput {
  /** Previous session's working sets for this exercise (standard sets only). */
  previousSets: Array<{ weight: number; reps: number; dropIndex?: number }>;
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
 * Parse a target-reps string into a low/high range.
 * "8-12" → {8,12}; "5" → {5,5}; unparseable → {10,10}.
 */
export function parseRepTarget(targetReps: string): RepRange {
  const matches = targetReps.match(/\d+/g);
  if (!matches || matches.length === 0) return { low: 10, high: 10 };
  const nums = matches.map((n) => parseInt(n, 10));
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  return { low, high };
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

  // Not yet — keep the weight, aim for the top of the range.
  return {
    suggestedWeight: weight,
    suggestedReps: high,
    ready: false,
    reason: `Aim for ${weight}×${high} to level up`,
  };
}
