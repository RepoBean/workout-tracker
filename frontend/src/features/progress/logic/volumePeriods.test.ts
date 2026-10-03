import { describe, expect, it } from 'vitest';
import type { Session, Set as WorkoutSet } from '../../../shared/api/types';
import { localDateKey, startOfWeek, volumeComparison, weeklyVolumes } from './volumePeriods';

// Local-time constructors throughout, so the tests hold in any TZ.
const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h, 0, 0);

let nextId = 1;
function session(completed: Date | null, volume: number): Session {
    const set = { id: nextId++, weight: volume, reps: 1 } as WorkoutSet;
    return {
        id: nextId++, completedAt: completed ? completed.toISOString() : null, sets: [set],
    } as Session;
}
const volumeOf = (s: WorkoutSet) => s.weight * s.reps;

describe('startOfWeek / localDateKey', () => {
    it('weeks start Sunday', () => {
        expect(localDateKey(startOfWeek(at(2026, 10, 3)))).toBe('2026-09-27'); // Sat → previous Sun
        expect(localDateKey(startOfWeek(at(2026, 9, 27, 0)))).toBe('2026-09-27'); // Sun stays
    });

    it('keys late-evening sessions by their local date', () => {
        expect(localDateKey(at(2026, 10, 3, 23))).toBe('2026-10-03');
    });
});

describe('weeklyVolumes', () => {
    it('buckets whole Sunday weeks, oldest first, ending with the current week', () => {
        const now = at(2026, 10, 1, 12); // Thursday
        const weeks = weeklyVolumes([
            session(at(2026, 9, 27, 23), 100),   // Sun this week
            session(at(2026, 10, 3, 23), 999),   // Sat this week (future, still bucketed)
            session(at(2026, 9, 26, 23), 50),    // Sat last week
            session(null, 7),                    // in progress: ignored
        ], volumeOf, now, 3);
        expect(weeks.map(w => [w.weekStart, w.totalVolume])).toEqual([
            ['2026-09-13', 0], ['2026-09-20', 50], ['2026-09-27', 1099],
        ]);
        expect(weeks[2].weekLabel).toBe('Sep 27');
    });
});

describe('volumeComparison', () => {
    it('compares week-to-date with last week through the same weekday', () => {
        const now = at(2026, 10, 1, 9); // Thursday morning
        const result = volumeComparison([
            session(at(2026, 9, 28), 100),       // Mon this week
            session(at(2026, 9, 21), 80),        // Mon last week: counted
            session(at(2026, 9, 24, 22), 20),    // Thu last week, late: counted (whole day)
            session(at(2026, 9, 25), 500),       // Fri last week: after the same point
        ], volumeOf, now);
        expect(result.thisWeek).toBe(100);
        expect(result.lastWeek).toBe(100);
    });

    it('compares month-to-date with last month through the same day', () => {
        const now = at(2026, 10, 3, 9);
        const result = volumeComparison([
            session(at(2026, 10, 2), 10),
            session(at(2026, 9, 3, 23), 30),     // same day last month: counted
            session(at(2026, 9, 4), 1000),       // after the same point
            session(at(2026, 8, 31), 1000),      // two months back
        ], volumeOf, now);
        expect(result.thisMonth).toBe(10);
        expect(result.lastMonth).toBe(30);
    });

    it('clamps the same day to the end of a shorter month', () => {
        const now = at(2026, 3, 31, 9); // Mar 31 → Feb has 28 days
        const result = volumeComparison([
            session(at(2026, 2, 28, 20), 40),
            session(at(2026, 3, 1), 5),          // this month, not last
        ], volumeOf, now);
        expect(result.lastMonth).toBe(40);
        expect(result.thisMonth).toBe(5);
    });

    it('crosses the year boundary', () => {
        const now = at(2027, 1, 2, 9); // Sat Jan 2 2027
        const result = volumeComparison([
            session(at(2026, 12, 2), 60),
            session(at(2026, 12, 27), 15),       // Sun: same week as Jan 2
            session(at(2026, 12, 26), 25),       // Sat last week: same weekday
        ], volumeOf, now);
        expect(result).toEqual({ thisWeek: 15, lastWeek: 25, thisMonth: 0, lastMonth: 60 });
    });
});
