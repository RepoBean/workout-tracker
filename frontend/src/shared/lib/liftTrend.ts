/**
 * "Is this lift progressing?" — one definition for the coach's all-time block and the
 * Progress overview, so the page and the coach never disagree.
 *
 * Input is a lift's dated history reduced to one DayTop per YYYY-MM-DD: the heaviest
 * working weight that day plus the reps done at exactly that weight. Pure; `today` is
 * always passed in.
 */

/** A lift is treated as dropped (coach) / inactive (Progress) once this many days pass without it. */
export const DROPPED_AFTER_DAYS = 42;
/** Sessions at one top weight with no added weight or reps before it reads as a stall. */
export const STALL_SESSIONS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One date's heaviest working weight, and the reps done at exactly that weight. */
export interface DayTop {
  weight: number;
  /** Best single-set reps at `weight`. */
  bestReps: number;
  /** Total reps across all sets at `weight`. */
  totalReps: number;
}

export function addToDayTop(day: DayTop | undefined, weight: number, reps: number): DayTop {
  if (!day || weight > day.weight) return { weight, bestReps: reps, totalReps: reps };
  if (weight < day.weight) return day;
  return { weight, bestReps: Math.max(day.bestReps, reps), totalReps: day.totalReps + reps };
}

/** Whole days from one YYYY-MM-DD to another; 0 when either is unparseable. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

/** Local calendar date as YYYY-MM-DD. Never UTC — "today" means the user's today. */
export function localToday(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function orderedDays(topByDate: ReadonlyMap<string, DayTop>): { dates: string[]; days: DayTop[] } {
  const dates = [...topByDate.keys()].sort();
  return { dates, days: dates.map((d) => topByDate.get(d) as DayTop) };
}

/**
 * Sessions since the lift last progressed, or 0.
 *
 * Double progression holds the weight while reps climb, so weight alone is not a stall.
 * Take the trailing run of dates at the latest top weight; the first is the baseline, and a
 * later date "improves" if its best single-set reps or its total reps at that weight beat
 * every earlier date in the run. The count runs from the last improvement (or the
 * baseline) through the latest date, inclusive.
 */
export function stallRun(topByDate: ReadonlyMap<string, DayTop>): { sessions: number; weight: number } {
  const { days } = orderedDays(topByDate);
  if (days.length === 0) return { sessions: 0, weight: 0 };
  const weight = days[days.length - 1].weight;
  if (!weight) return { sessions: 0, weight: 0 };

  let start = days.length - 1;
  while (start > 0 && days[start - 1].weight === weight) start -= 1;

  let lastImproved = start;
  let bestReps = days[start].bestReps;
  let totalReps = days[start].totalReps;
  for (let i = start + 1; i < days.length; i++) {
    if (days[i].bestReps > bestReps || days[i].totalReps > totalReps) lastImproved = i;
    bestReps = Math.max(bestReps, days[i].bestReps);
    totalReps = Math.max(totalReps, days[i].totalReps);
  }
  return { sessions: days.length - lastImproved, weight };
}

export type LiftStatus =
  | { kind: 'none' }
  | { kind: 'inactive'; lastDate: string }
  | { kind: 'new' }
  | { kind: 'stalled'; sessions: number; weight: number }
  | { kind: 'lighter' }
  | { kind: 'progressing' }
  | { kind: 'holding' };

export type LiftStatusKind = LiftStatus['kind'];

/**
 * One lift's status. First match wins:
 *   no history → none; idle DROPPED_AFTER_DAYS+ → inactive; < 3 dates → new;
 *   stall count ≥ STALL_SESSIONS → stalled; latest date dropped to a lower top weight →
 *   lighter; stall count 1 → progressing; stall count 2 → holding.
 */
export function liftStatus(topByDate: ReadonlyMap<string, DayTop>, today: string): LiftStatus {
  const { dates, days } = orderedDays(topByDate);
  if (dates.length === 0) return { kind: 'none' };

  const lastDate = dates[dates.length - 1];
  if (daysBetween(lastDate, today) >= DROPPED_AFTER_DAYS) return { kind: 'inactive', lastDate };
  if (dates.length < 3) return { kind: 'new' };

  const stall = stallRun(topByDate);
  if (stall.sessions >= STALL_SESSIONS) {
    return { kind: 'stalled', sessions: stall.sessions, weight: stall.weight };
  }
  if (days[days.length - 1].weight < days[days.length - 2].weight) return { kind: 'lighter' };
  return stall.sessions === 1 ? { kind: 'progressing' } : { kind: 'holding' };
}
