/**
 * Personal Record (1-rep max) helpers for active session PR celebrations.
 *
 * Mirrors the filter rules of `personalRecords()` in
 * `features/progress/logic/exerciseIndex.ts` (working sets only, effective
 * weight > 0, reps > 0, best Epley 1RM) so the celebration toast and the
 * Records tab agree on what counts as a PR.
 */

import { epleyOneRepMax } from '../../../shared/lib/oneRepMax';
import { effectiveWeight } from '../../../shared/lib/effectiveWeight';

export { epleyOneRepMax };

export function computeBestOneRepMax(
  sets: Array<{
    weight: number;
    reps: number;
    durationSec: number | null;
    distance: number | null;
    dropIndex: number;
  }>,
  bodyweight: number | null
): number {
  let best = 0;
  for (const s of sets) {
    if (s.dropIndex !== 0) continue;
    if ((s.durationSec ?? 0) > 0 || (s.distance ?? 0) > 0) continue; // cardio
    // Assisted (negative) sets count at effective load; skipped without a bodyweight
    const weight = effectiveWeight(s.weight, bodyweight);
    if (weight == null || weight <= 0 || s.reps <= 0) continue;
    const e = epleyOneRepMax(weight, s.reps);
    if (e > best) best = e;
  }
  return best;
}
