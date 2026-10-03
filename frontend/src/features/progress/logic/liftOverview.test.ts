import { describe, expect, it } from 'vitest';
import type { Session, Set as WorkoutSet } from '../../../shared/api/types';
import { catalogNames } from '../../../shared/lib/catalog';
import { buildAllTimeBlock } from '../../coach/lib/dossier';
import { buildLiftOverview, formatChange, shortDate, statusLabel, summaryLine } from './liftOverview';

let nextId = 1;

function set(over: Partial<WorkoutSet> = {}): WorkoutSet {
    return {
        id: nextId++, sessionId: 1, exerciseId: null, exerciseName: 'Row', weight: 100, reps: 8,
        setNumber: 1, perceivedEffort: null, dropIndex: 0, heartRateAvg: null, heartRateMax: null,
        durationSec: null, distance: null, catalogId: null,
        createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z',
        ...over,
    };
}

function session(completedAt: string | null, sets: WorkoutSet[]): Session {
    return {
        id: nextId++, programId: 1, programName: 'P', workoutId: 1, workoutName: 'W', completedAt,
        isAdHoc: false, heartRateAvg: null, heartRateMin: null, heartRateMax: null, heartRateSeries: null,
        exerciseNotes: null, createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z',
        sets,
    };
}

/** One session per day from 2026-09-01, each [weight, reps] pair one set of `name`. */
function days(name: string, perDay: Array<Array<[number, number]>>, startDay = 1): Session[] {
    return perDay.map((pairs, i) => session(
        `2026-09-${String(startDay + i).padStart(2, '0')}T11:00:00.000Z`,
        pairs.map(([weight, reps], k) => set({ exerciseName: name, weight, reps, setNumber: k + 1 })),
    ));
}

const TODAY = '2026-09-20';

describe('buildLiftOverview', () => {
    it('gives every requested lift a row, none when there is no history', () => {
        const { rows, counts } = buildLiftOverview([], ['Squat'], null, TODAY);
        expect(rows).toEqual([{ name: 'Squat', status: { kind: 'none' }, lastSet: null, spark: [], changePct: null }]);
        expect(counts).toEqual([{ kind: 'none', count: 1 }]);
    });

    it('takes the last top set (raw weight) and a best-1RM sparkline with % change', () => {
        const sessions = days('Row', [[[100, 8]], [[100, 9]], [[105, 8], [100, 10]]]);
        const [row] = buildLiftOverview(sessions, ['Row'], null, TODAY).rows;
        expect(row.status).toEqual({ kind: 'progressing' });
        expect(row.lastSet).toEqual({ weight: 105, reps: 8, completedAt: '2026-09-03T11:00:00.000Z' });
        expect(row.spark).toEqual([127, 130, 133]);
        expect(row.changePct).toBe(5);
    });

    it('caps the sparkline at the last 8 dates', () => {
        const sessions = days('Row', Array.from({ length: 10 }, (_, i) => [[100 + i, 1]]));
        const [row] = buildLiftOverview(sessions, ['Row'], null, TODAY).rows;
        expect(row.spark).toEqual([102, 103, 104, 105, 106, 107, 108, 109]);
    });

    it('applies the PR filters: drop sets, 0 weight, 0 reps, cardio and incomplete sessions are ignored', () => {
        const sessions = [
            ...days('Row', [[[100, 8]], [[100, 8]]]),
            session('2026-09-03T11:00:00.000Z', [
                set({ weight: 200, reps: 8, dropIndex: 1 }),
                set({ weight: 300, reps: 0 }),
                set({ weight: 0, reps: 20 }),
                set({ weight: 0, reps: 0, durationSec: 600 }),
            ]),
            session(null, [set({ weight: 500, reps: 5 })]),
        ];
        const [row] = buildLiftOverview(sessions, ['Row'], null, TODAY).rows;
        expect(row.status).toEqual({ kind: 'new' });
        expect(row.spark).toHaveLength(2);
    });

    it('reads assisted lifts at effective load for status, raw for the last set; skips them without bodyweight', () => {
        const sessions = days('Pull-Up', [[[-50, 8]], [[-45, 8]], [[-40, 8]]]);
        const [row] = buildLiftOverview(sessions, ['Pull-Up'], 180, TODAY).rows;
        expect(row.status).toEqual({ kind: 'progressing' });
        expect(row.lastSet?.weight).toBe(-40);
        expect(buildLiftOverview(sessions, ['Pull-Up'], null, TODAY).rows[0].status).toEqual({ kind: 'none' });
    });

    it('groups merged spellings by catalog identity', () => {
        const catalog = catalogNames([
            { id: 1, name: 'Low Incline DB Press', aliases: ['Low Incline Dumbbell Press'], setCount: 0, exerciseCount: 0, createdAt: '', updatedAt: '' },
        ]);
        const sessions = [
            ...days('Low Incline Dumbbell Press', [[[60, 10]], [[60, 10]]]),
            ...days('Low Incline DB Press', [[[60, 10]]], 3),
        ].map((s) => ({ ...s, sets: s.sets!.map((x) => ({ ...x, catalogId: 1 })) }));
        const [row] = buildLiftOverview(sessions, ['Low Incline DB Press'], null, TODAY, catalog).rows;
        expect(row.status).toEqual({ kind: 'stalled', sessions: 3, weight: 60 });
    });

    it('orders stalled, lighter, holding, progressing, new, inactive, none; program order within', () => {
        const sessions = [
            ...days('Prog', [[[100, 8]], [[100, 8]], [[100, 9]]]),
            ...days('Stall A', [[[100, 8]], [[100, 8]], [[100, 8]]]),
            ...days('Hold', [[[100, 8]], [[100, 9]], [[100, 9]]]),
            ...days('Light', [[[100, 8]], [[110, 8]], [[90, 8]]]),
            ...days('New', [[[100, 8]]]),
            ...days('Stall B', [[[50, 8]], [[50, 8]], [[50, 8]]]),
            session('2026-07-01T11:00:00.000Z', [set({ exerciseName: 'Old' })]),
        ];
        const names = ['None', 'Old', 'New', 'Prog', 'Stall A', 'Hold', 'Light', 'Stall B'];
        const { rows, counts } = buildLiftOverview(sessions, names, null, TODAY);
        expect(rows.map((r) => r.name)).toEqual(['Stall A', 'Stall B', 'Light', 'Hold', 'Prog', 'New', 'Old', 'None']);
        expect(summaryLine(counts)).toBe('1 progressing · 1 holding · 2 stalled · 1 lighter · 1 new · 1 inactive · 1 no history');
    });

    it('agrees with the coach: a lift the overview calls stalled is flagged stalled in the all-time block', () => {
        const sessions = [
            ...days('Row', [[[100, 8]], [[100, 9]], [[100, 9]], [[100, 8]]]),
            ...days('Press', [[[50, 8]], [[50, 8]], [[55, 6]]]),
        ];
        const { rows } = buildLiftOverview(sessions, ['Row', 'Press'], null, TODAY);
        const coach = buildAllTimeBlock(sessions, TODAY);
        expect(rows[0]).toMatchObject({ name: 'Row', status: { kind: 'stalled', sessions: 3, weight: 100 } });
        expect(coach).toContain('Row: 4 sets, 4 dates, 100 lb, best 100x9 (1RM 130), last 2026-09-04 [stalled 3 sessions @100]');
        expect(rows[1].status.kind).toBe('progressing');
        expect(coach).not.toMatch(/Press:.*stalled/);
    });
});

describe('labels', () => {
    it('formats the chip, date, change and summary', () => {
        expect(statusLabel({ kind: 'stalled', sessions: 4, weight: 100 }, TODAY)).toBe('Stalled · 4 sessions');
        expect(statusLabel({ kind: 'inactive', lastDate: '2026-06-15' }, TODAY)).toBe('Not done since Jun 15');
        expect(statusLabel({ kind: 'inactive', lastDate: '2025-12-20' }, TODAY)).toBe('Not done since Dec 20, 2025');
        expect(shortDate('2026-10-02T16:06:01.374Z', '2026-10-03')).toMatch(/^Oct [23]$/);
        expect(formatChange(6)).toBe('+6%');
        expect(formatChange(-3)).toBe('−3%');
        expect(formatChange(0)).toBe('0%');
        expect(summaryLine([])).toBe('');
    });
});
