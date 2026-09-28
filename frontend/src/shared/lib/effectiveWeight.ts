/**
 * Assisted lifts are logged as a negative weight: −40 means "40 lbs of assistance"
 * (assisted pull-up / dip machine). Entry, prefill and progression keep that raw
 * signed number (−40 → −35 is "less help"); volume, 1RM and PRs use the effective
 * load, bodyweight + weight, so an assisted set scores on the same scale as a
 * hand-computed "effective" entry.
 */
export const isAssisted = (weight: number): boolean => weight < 0;

/**
 * Load actually moved. `null` = not computable (assisted set with no bodyweight on
 * file) — callers skip the set, exactly as they already skip 0-weight sets.
 */
export function effectiveWeight(weight: number, bodyweight: number | null): number | null {
  if (weight >= 0) return weight;
  if (bodyweight == null) return null;
  return Math.max(0, bodyweight + weight);
}

/** weight × reps at effective load; 0 when the load isn't computable. */
export function setVolume(set: { weight: number; reps: number }, bodyweight: number | null): number {
  return (effectiveWeight(set.weight, bodyweight) ?? 0) * set.reps;
}
