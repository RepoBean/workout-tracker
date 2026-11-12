import type { Session } from '../api/types';
import { isCardioSet } from '../api/predicates';
import { localDateKey, startOfWeek } from './localDate';
import { daysBetween } from './liftTrend';
import { MUSCLES, type CatalogMuscles, type Muscle } from './muscles';

/**
 * Weekly working sets per muscle (v4 C5) — shared by Progress → Muscles and the coach dossier.
 * Pure and `today`-explicit.
 *
 *  - Counts working sets (dropIndex 0) of strength lifts with reps > 0, any weight: this is
 *    sets, not load, so bodyweight and assisted sets count.
 *  - A set's muscles come from its catalog entry: 1 set to each primary, ½ to each secondary.
 *    No catalogId or an untagged entry → `untaggedSets`.
 *  - Sunday weeks on the session's LOCAL day. "This week" is Sunday → today; the average is
 *    over the 4 whole weeks before it.
 *  - Flag: trained at least once, last trained 14+ days ago. Never-trained muscles get no flag
 *    and no band.
 */

export const SECONDARY_SHARE = 0.5;
export const AVERAGE_WEEKS = 4;
export const UNTRAINED_AFTER_DAYS = 14;

/**
 * Guideline band on the 4-week average (D10): one fixed rule of thumb for every muscle, not a
 * prescription. Lower bounds; `solid` includes both 10 and 20.
 */
export const BANDS = { building: 6, solid: 10, highAbove: 20 } as const;
export type Band = 'low' | 'building' | 'solid' | 'high';

export function muscleBand(average: number): Band {
  if (average > BANDS.highAbove) return 'high';
  if (average >= BANDS.solid) return 'solid';
  if (average >= BANDS.building) return 'building';
  return 'low';
}

export interface MuscleRow {
  muscle: Muscle;
  thisWeek: number;
  /** Average of the last 4 whole weeks. */
  average: number;
  /** Local YYYY-MM-DD, null = never trained. */
  lastTrained: string | null;
  daysSince: number | null;
  flagged: boolean;
  /** null when never trained. */
  band: Band | null;
}

export interface MuscleSummary {
  /** Every muscle in vocabulary order. */
  rows: MuscleRow[];
  /** Counted working sets on untagged lifts over the last 4 whole weeks. */
  untaggedSets: number;
  /** All counted working sets over the same window. */
  totalSets: number;
  /** Any catalog entry carries tags at all. */
  anyTags: boolean;
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return localDateKey(new Date(y, m - 1, d + days));
}

export function muscleSummary(sessions: Session[], muscles: CatalogMuscles, today: string): MuscleSummary {
  const [y, m, d] = today.split('-').map(Number);
  const weekStart = localDateKey(startOfWeek(new Date(y, m - 1, d)));
  const windowStart = addDays(weekStart, -7 * AVERAGE_WEEKS);

  const thisWeek = new Map<Muscle, number>();
  const window = new Map<Muscle, number>();
  const last = new Map<Muscle, string>();
  let untaggedSets = 0;
  let totalSets = 0;

  const add = (map: Map<Muscle, number>, muscle: Muscle, n: number) => map.set(muscle, (map.get(muscle) ?? 0) + n);

  for (const session of sessions) {
    if (!session.completedAt) continue;
    const day = localDateKey(session.completedAt);
    const inWindow = day >= windowStart && day < weekStart;
    const inThisWeek = day >= weekStart && day <= today;
    for (const set of session.sets ?? []) {
      if (set.dropIndex !== 0 || set.reps <= 0 || isCardioSet(set)) continue;
      if (inWindow) totalSets++;
      const tags = set.catalogId != null ? muscles.get(set.catalogId) : undefined;
      if (!tags) {
        if (inWindow) untaggedSets++;
        continue;
      }
      const shares: Array<[string, number]> = [
        ...tags.primary.map((x): [string, number] => [x, 1]),
        ...tags.secondary.map((x): [string, number] => [x, SECONDARY_SHARE]),
      ];
      for (const [id, n] of shares) {
        if (!(MUSCLES as readonly string[]).includes(id)) continue; // an id this build doesn't know
        const muscle = id as Muscle;
        if ((last.get(muscle) ?? '') < day) last.set(muscle, day);
        if (inWindow) add(window, muscle, n);
        if (inThisWeek) add(thisWeek, muscle, n);
      }
    }
  }

  const rows = MUSCLES.map((muscle): MuscleRow => {
    const lastTrained = last.get(muscle) ?? null;
    const daysSince = lastTrained ? daysBetween(lastTrained, today) : null;
    const average = (window.get(muscle) ?? 0) / AVERAGE_WEEKS;
    return {
      muscle,
      thisWeek: thisWeek.get(muscle) ?? 0,
      average,
      lastTrained,
      daysSince,
      flagged: daysSince !== null && daysSince >= UNTRAINED_AFTER_DAYS,
      band: lastTrained ? muscleBand(average) : null,
    };
  });

  return { rows, untaggedSets, totalSets, anyTags: muscles.size > 0 };
}

/** 9.5 → "9.5", 6 → "6", 2.625 → "2.6". */
export function formatSetCount(n: number): string {
  return String(Math.round(n * 10) / 10);
}
