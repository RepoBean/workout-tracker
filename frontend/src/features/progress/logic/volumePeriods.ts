// Week/month volume math for the Volume tab. Pure and `now`-explicit so it can be
// tested. Weeks start Sunday, like the dashboard strip (ThisWeek.tsx) and the server
// streak. Keys are local dates — toISOString() would shift late-evening sessions into
// the next UTC day.

import type { Session, Set } from '../../../shared/api/types';

export interface WeeklyVolume {
    weekStart: string;      // local YYYY-MM-DD of the Sunday
    weekLabel: string;      // e.g., "Jan 6"
    totalVolume: number;    // sum of weight × reps for all sets
}

/** Period-to-date volumes, each compared with the previous period up to the same point. */
export interface VolumeComparison {
    thisWeek: number;       // Sunday 00:00 → now
    lastWeek: number;       // last Sunday 00:00 → end of the same weekday last week
    thisMonth: number;      // the 1st 00:00 → now
    lastMonth: number;      // last month's 1st → end of the same day of month (clamped)
}

export type VolumeOf = (set: Set) => number;

export function localDateKey(d: Date): string {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Local midnight of the Sunday on or before `d`. */
export function startOfWeek(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

function addDays(d: Date, days: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function sessionVolume(session: Session, volumeOf: VolumeOf): number {
    let total = 0;
    session.sets?.forEach(set => { total += volumeOf(set); });
    return total;
}

/** Completed sessions with their completion time and volume. */
function completed(sessions: Session[], volumeOf: VolumeOf) {
    return sessions.flatMap(s => s.completedAt
        ? [{ at: new Date(s.completedAt), volume: sessionVolume(s, volumeOf) }]
        : []);
}

/** Whole Sunday–Saturday weeks, oldest first, ending with the current one. */
export function weeklyVolumes(
    sessions: Session[],
    volumeOf: VolumeOf,
    now: Date,
    weeks: number = 12,
): WeeklyVolume[] {
    const byWeek = new Map<string, number>();
    completed(sessions, volumeOf).forEach(({ at, volume }) => {
        const key = localDateKey(startOfWeek(at));
        byWeek.set(key, (byWeek.get(key) || 0) + volume);
    });

    const current = startOfWeek(now);
    const result: WeeklyVolume[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
        const start = addDays(current, -7 * i);
        const key = localDateKey(start);
        result.push({
            weekStart: key,
            weekLabel: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            totalVolume: byWeek.get(key) || 0,
        });
    }
    return result;
}

export function volumeComparison(sessions: Session[], volumeOf: VolumeOf, now: Date): VolumeComparison {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const weekStart = startOfWeek(now);
    const lastWeekStart = addDays(weekStart, -7);
    const lastWeekEnd = addDays(today, -7 + 1); // exclusive: end of the same weekday

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const daysInLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    const lastMonthEnd = new Date(            // exclusive: end of the same day of month
        now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), daysInLastMonth) + 1);

    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const result: VolumeComparison = { thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0 };
    const within = (at: Date, from: Date, to: Date) => at >= from && at < to;

    // The current periods run to their natural end; nothing is logged in the future.
    completed(sessions, volumeOf).forEach(({ at, volume }) => {
        if (within(at, weekStart, addDays(weekStart, 7))) result.thisWeek += volume;
        if (within(at, lastWeekStart, lastWeekEnd)) result.lastWeek += volume;
        if (within(at, monthStart, nextMonthStart)) result.thisMonth += volume;
        if (within(at, lastMonthStart, lastMonthEnd)) result.lastMonth += volume;
    });
    return result;
}
