/**
 * Bodyweight on a session's day (v4 C3, docs/v4-bundle-c3-bodyweight.md). Assisted lifts
 * score as bodyweight + weight, and which bodyweight is a client decision:
 *
 *  - the latest weigh-in on or before the session's **local** day (the API sends ISO `…Z`;
 *    comparing that raw string would put an evening session on the next day's weigh-in),
 *  - else the earliest weigh-in (back-applied to older history, same on every device),
 *  - else the device's profile bodyweight (no weigh-ins at all, or a pre-C3 backend).
 *
 * `null` for the date means "now" (the session in progress): the latest weigh-in.
 */
import { localDateKey } from './localDate';
import { daysBetween } from './liftTrend';

export interface WeighIn {
  date: string; // local YYYY-MM-DD
  weight: number;
  updatedAt: string;
}

export type BodyweightAt = (completedAt: string | null | undefined) => number | null;

function byDate<T extends WeighIn>(weighIns: readonly T[]): T[] {
  return [...weighIns].sort((a, b) => a.date.localeCompare(b.date));
}

/** Index of the last weigh-in dated on or before `day`; -1 if none. */
function lastOnOrBefore(sorted: readonly WeighIn[], day: string): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].date <= day) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function bodyweightLookup(weighIns: readonly WeighIn[], fallback: number | null): BodyweightAt {
  const sorted = byDate(weighIns);
  if (sorted.length === 0) return () => fallback;
  const latest = sorted[sorted.length - 1].weight;
  return (completedAt) => {
    if (!completedAt) return latest;
    const i = lastOnOrBefore(sorted, localDateKey(completedAt));
    return i >= 0 ? sorted[i].weight : sorted[0].weight;
  };
}

/** Same value for every date: tests and callers that only have one number. */
export const constantBodyweight = (bodyweight: number | null): BodyweightAt => () => bodyweight;

/** Changes whenever a weigh-in is added, edited or deleted — for memo keys. */
export function weighInFingerprint(weighIns: readonly WeighIn[]): string {
  let max = '';
  for (const w of weighIns) if (w.updatedAt > max) max = w.updatedAt;
  return `${weighIns.length}:${max}`;
}

export function latestWeighIn<T extends WeighIn>(weighIns: readonly T[]): T | null {
  return weighIns.length ? byDate(weighIns)[weighIns.length - 1] : null;
}

export interface BodyweightChange {
  delta: number; // latest − baseline, lbs (1 decimal)
  days: number;  // days between the two weigh-ins
}

/**
 * Change over roughly `windowDays`: latest minus the latest weigh-in on or before
 * (latest date − windowDays); when none is that old, minus the earliest, over its real
 * span. Null with fewer than two weigh-ins.
 */
export function bodyweightChange(weighIns: readonly WeighIn[], windowDays: number): BodyweightChange | null {
  const sorted = byDate(weighIns);
  if (sorted.length < 2) return null;
  const latest = sorted[sorted.length - 1];
  const [y, m, d] = latest.date.split('-').map(Number);
  const cutoff = localDateKey(new Date(y, m - 1, d - windowDays));
  const i = lastOnOrBefore(sorted, cutoff);
  const base = i >= 0 ? sorted[i] : sorted[0];
  if (base === latest) return null;
  return {
    delta: Math.round((latest.weight - base.weight) * 10) / 10,
    days: daysBetween(base.date, latest.date),
  };
}

/** "182.4" / "185": one decimal at most. */
export function formatBodyweight(weight: number): string {
  return String(Math.round(weight * 10) / 10);
}
