import { describe, expect, it } from 'vitest';
import type { Exercise, Program, Session, Set as WorkoutSet } from '../../../shared/api/types';
import {
    buildExerciseIndex,
    cardioHistory,
    personalRecords,
    strengthHistory,
} from './exerciseIndex';
import { catalogNames } from '../../../shared/lib/catalog';

// Characterization: these pin the Progress page's name-keyed behaviour as it was
// inside useProgressData before the extraction. Fixture follows the live shape —
// the Low Incline Dumbbell/DB Press rename split, drop sets, a cardio lift, an
// assisted lift, and an incomplete (in-progress) session.

let nextId = 1;

function set(over: Partial<WorkoutSet> = {}): WorkoutSet {
    return {
        id: nextId++,
        sessionId: 1,
        exerciseId: null,
        exerciseName: 'Leg Press',
        weight: 200,
        reps: 10,
        setNumber: 1,
        perceivedEffort: null,
        dropIndex: 0,
        heartRateAvg: null,
        heartRateMax: null,
        durationSec: null,
        distance: null,
        catalogId: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
        ...over,
    };
}

function session(id: number, completedAt: string | null, workoutName: string, sets: WorkoutSet[]): Session {
    return {
        id,
        programId: 1,
        programName: 'Upper/Lower',
        workoutId: 1,
        workoutName,
        completedAt,
        isAdHoc: false,
        heartRateAvg: null,
        heartRateMin: null,
        heartRateMax: null,
        heartRateSeries: null,
        exerciseNotes: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
        sets,
    };
}

function exercise(name: string, over: Partial<Exercise> = {}): Exercise {
    return {
        id: nextId++,
        workoutId: 1,
        name,
        targetSets: 3,
        targetReps: '8-12',
        orderIndex: 0,
        supersetGroup: null,
        exerciseType: 'strength',
        cardioModality: null,
        targetDurationSec: null,
        targetDistance: null,
        catalogId: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
        ...over,
    };
}

function program(id: number, isActive: boolean, exercises: Exercise[]): Program {
    return {
        id,
        name: `Program ${id}`,
        isActive,
        isArchived: false,
        currentWorkoutIndex: 0,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
        workouts: [{
            id,
            programId: id,
            name: 'Day 1',
            orderIndex: 0,
            createdAt: '2026-01-01T10:00:00.000Z',
            updatedAt: '2026-01-01T10:00:00.000Z',
            exercises,
        }],
    };
}

const APR = '2026-04-03T11:00:00.000Z';
const JUN = '2026-06-26T11:00:00.000Z';
const SEP = '2026-09-11T11:00:00.000Z';
const NOW = new Date('2026-09-28T12:00:00.000Z');

// Newest first, as /sessions/history returns them.
const SESSIONS: Session[] = [
    session(4, null, 'Lower', [set({ exerciseName: 'Leg Press', weight: 500, reps: 10 })]),
    session(3, SEP, 'Cardio', [
        set({ exerciseName: 'Treadmill', weight: 0, reps: 0, setNumber: 2, durationSec: 600 }),
        set({ exerciseName: 'Treadmill', weight: 0, reps: 0, setNumber: 1, durationSec: 1800, distance: 3, heartRateAvg: 140 }),
        set({ exerciseName: 'Neutral Grip Pull-Up', weight: -40, reps: 8 }),
    ]),
    session(2, JUN, 'Upper', [
        set({ exerciseName: 'Low Incline DB Press', weight: 65, reps: 10, setNumber: 1 }),
        set({ exerciseName: 'Low Incline DB Press', weight: 65, reps: 9, setNumber: 2, perceivedEffort: 8 }),
        set({ exerciseName: 'Leg Press', weight: 220, reps: 10 }),
    ]),
    session(1, APR, 'Upper', [
        set({ exerciseName: 'Low Incline Dumbbell Press', weight: 40, reps: 10, setNumber: 2, dropIndex: 1 }),
        set({ exerciseName: 'Low Incline Dumbbell Press', weight: 60, reps: 8, setNumber: 2 }),
        set({ exerciseName: 'Low Incline Dumbbell Press', weight: 60, reps: 10, setNumber: 1 }),
        set({ exerciseName: 'Leg Press', weight: 200, reps: 10 }),
    ]),
];

const PROGRAMS: Program[] = [
    program(9, false, [exercise('Squat')]),
    program(1, true, [
        exercise('Low Incline DB Press'),
        exercise('Leg Press'),
        exercise('Treadmill', { exerciseType: 'cardio', cardioModality: 'treadmill' }),
        exercise('Leg Press'),
    ]),
];

describe('buildExerciseIndex', () => {
    const index = buildExerciseIndex(SESSIONS, PROGRAMS);

    it('lists every logged name, sorted, including incomplete sessions', () => {
        expect(index.allExerciseNames).toEqual([
            'Leg Press',
            'Low Incline DB Press',
            'Low Incline Dumbbell Press',
            'Neutral Grip Pull-Up',
            'Treadmill',
        ]);
    });

    it('ranks strength by strength-set count, ties in first-seen order', () => {
        // Counts: Leg Press 3 (incl. the incomplete session), Low Incline Dumbbell 3,
        // Low Incline DB 2, Pull-Up 1. Ties keep first-seen order, and history
        // arrives newest first.
        expect(index.mostTrainedStrength).toEqual([
            'Leg Press',
            'Low Incline Dumbbell Press',
            'Low Incline DB Press',
            'Neutral Grip Pull-Up',
        ]);
        expect(index.mostTrainedCardio).toEqual(['Treadmill']);
    });

    it('ranks cardio separately, so one-set-a-session cardio is never crowded out', () => {
        const busy = [
            session(10, SEP, 'Cardio', [set({ exerciseName: 'Ride', weight: 0, reps: 0, durationSec: 1200 })]),
            session(11, SEP, 'Upper', ['A', 'B', 'C', 'D', 'E', 'F'].flatMap(n =>
                [1, 2, 3, 4].map(setNumber => set({ exerciseName: n, setNumber })))),
        ];
        const busyIndex = buildExerciseIndex(busy, []);
        expect(busyIndex.mostTrainedStrength).toEqual(['A', 'B', 'C', 'D', 'E']);
        expect(busyIndex.mostTrainedCardio).toEqual(['Ride']);
    });

    it('splits strength and cardio names out by their sets', () => {
        expect(index.allCardioExerciseNames).toEqual(['Treadmill']);
        expect(index.allStrengthExerciseNames).toEqual([
            'Leg Press', 'Low Incline DB Press', 'Low Incline Dumbbell Press', 'Neutral Grip Pull-Up',
        ]);
    });

    it('takes active-program names in program order, deduped, split by type', () => {
        expect(index.activeExercises).toEqual(['Low Incline DB Press', 'Leg Press']);
        expect(index.activeCardioExercises).toEqual(['Treadmill']);
    });

    it('is empty without data', () => {
        expect(buildExerciseIndex([], [])).toEqual({
            allExerciseNames: [],
            allStrengthExerciseNames: [],
            allCardioExerciseNames: [],
            mostTrainedStrength: [],
            mostTrainedCardio: [],
            activeExercises: [],
            activeCardioExercises: [],
        });
    });
});

describe('strengthHistory', () => {
    it('returns completed sessions oldest first with bests excluding drop sets', () => {
        expect(strengthHistory(SESSIONS, 'Leg Press', null)).toEqual([
            {
                sessionId: 1, date: APR, workoutName: 'Upper',
                sets: [{ weight: 200, reps: 10, setNumber: 1, perceivedEffort: undefined, dropIndex: 0 }],
                bestWeight: 200, bestVolume: 2000, bestEstimated1RM: 267,
            },
            {
                sessionId: 2, date: JUN, workoutName: 'Upper',
                sets: [{ weight: 220, reps: 10, setNumber: 1, perceivedEffort: undefined, dropIndex: 0 }],
                bestWeight: 220, bestVolume: 2200, bestEstimated1RM: 293,
            },
        ]);

        expect(strengthHistory(SESSIONS, 'Low Incline Dumbbell Press', null)).toEqual([{
            sessionId: 1, date: APR, workoutName: 'Upper',
            sets: [
                { weight: 60, reps: 10, setNumber: 1, perceivedEffort: undefined, dropIndex: 0 },
                { weight: 60, reps: 8, setNumber: 2, perceivedEffort: undefined, dropIndex: 0 },
                { weight: 40, reps: 10, setNumber: 2, perceivedEffort: undefined, dropIndex: 1 },
            ],
            bestWeight: 60, bestVolume: 600, bestEstimated1RM: 80,
        }]);
    });

    it('keeps a renamed lift as two separate series (name-keyed)', () => {
        expect(strengthHistory(SESSIONS, 'Low Incline DB Press', null).map(s => s.sessionId)).toEqual([2]);
        expect(strengthHistory(SESSIONS, 'Low Incline Dumbbell Press', null).map(s => s.sessionId)).toEqual([1]);
    });

    it('scores assisted sets at effective load, zero bests without a bodyweight', () => {
        expect(strengthHistory(SESSIONS, 'Neutral Grip Pull-Up', 185)[0]).toMatchObject({
            bestWeight: 145, bestVolume: 1160, bestEstimated1RM: 184,
        });
        expect(strengthHistory(SESSIONS, 'Neutral Grip Pull-Up', null)[0]).toMatchObject({
            sets: [{ weight: -40, reps: 8, setNumber: 1, perceivedEffort: undefined, dropIndex: 0 }],
            bestWeight: 0, bestVolume: 0, bestEstimated1RM: 0,
        });
    });

    it('ignores cardio sets and unknown names', () => {
        expect(strengthHistory(SESSIONS, 'Treadmill', null)).toEqual([]);
        expect(strengthHistory(SESSIONS, 'Nope', null)).toEqual([]);
    });
});

describe('cardioHistory', () => {
    it('totals duration/distance with a duration-weighted HR', () => {
        expect(cardioHistory(SESSIONS, 'Treadmill')).toEqual([{
            sessionId: 3, date: SEP, workoutName: 'Cardio',
            totalDurationSec: 2400, totalDistance: 3, avgPaceMph: 4.5, avgHr: 140,
            sets: [
                { setNumber: 1, durationSec: 1800, distance: 3, heartRateAvg: 140, perceivedEffort: undefined },
                { setNumber: 2, durationSec: 600, distance: null, heartRateAvg: null, perceivedEffort: undefined },
            ],
        }]);
        expect(cardioHistory(SESSIONS, 'Leg Press')).toEqual([]);
    });
});

describe('personalRecords', () => {
    it('keys by name, excludes cardio/drop/incomplete, sorts by 1RM', () => {
        expect(personalRecords(SESSIONS, 185, NOW)).toEqual([
            { exerciseName: 'Leg Press', estimated1RM: 293, weight: 220, reps: 10, date: JUN, isRecentPR: false },
            { exerciseName: 'Neutral Grip Pull-Up', estimated1RM: 184, weight: 145, reps: 8, date: SEP, isRecentPR: true },
            { exerciseName: 'Low Incline DB Press', estimated1RM: 87, weight: 65, reps: 10, date: JUN, isRecentPR: false },
            { exerciseName: 'Low Incline Dumbbell Press', estimated1RM: 80, weight: 60, reps: 10, date: APR, isRecentPR: false },
        ]);
    });

    it('records the set behind the best 1RM, not the best volume set, and dates from it', () => {
        // Old volume PR 100×20 (2000, 1RM 167) in June; new 1RM 150×5 (175, vol 750) in September.
        const records = personalRecords([
            session(21, SEP, 'Upper', [set({ exerciseName: 'Bench', weight: 150, reps: 5 })]),
            session(20, JUN, 'Upper', [set({ exerciseName: 'Bench', weight: 100, reps: 20 })]),
        ], null, NOW);
        expect(records).toEqual([
            { exerciseName: 'Bench', estimated1RM: 175, weight: 150, reps: 5, date: SEP, isRecentPR: true },
        ]);
    });

    it('a tie keeps the first time the 1RM was reached', () => {
        const records = personalRecords([
            session(23, SEP, 'Upper', [set({ exerciseName: 'Bench', weight: 150, reps: 5 })]),
            session(22, JUN, 'Upper', [set({ exerciseName: 'Bench', weight: 150, reps: 5 })]),
        ], null, NOW);
        expect(records[0]).toMatchObject({ date: JUN, isRecentPR: false });
    });

    it('applies the PR toast filters: zero weight or zero reps never count', () => {
        expect(personalRecords([
            session(24, SEP, 'Upper', [
                set({ exerciseName: 'Plank', weight: 0, reps: 12 }),
                set({ exerciseName: 'Bench', weight: 135, reps: 0 }),
            ]),
        ], null, NOW)).toEqual([]);
    });

    it('a single is its own 1RM', () => {
        expect(personalRecords([
            session(25, SEP, 'Upper', [set({ exerciseName: 'Deadlift', weight: 315, reps: 1 })]),
        ], null, NOW)[0]).toMatchObject({ estimated1RM: 315, weight: 315, reps: 1 });
    });

    it('drops assisted lifts without a bodyweight', () => {
        expect(personalRecords(SESSIONS, null, NOW).map(r => r.exerciseName)).toEqual([
            'Leg Press', 'Low Incline DB Press', 'Low Incline Dumbbell Press',
        ]);
    });
});

describe('catalog identity (after a merge)', () => {
    // Both spellings point at catalog entry 7, named after the current program's spelling.
    const PRESS = 7;
    const merged: Session[] = SESSIONS.map(s => ({
        ...s,
        sets: s.sets!.map(set => set.exerciseName.startsWith('Low Incline')
            ? { ...set, catalogId: PRESS }
            : set),
    }));
    const catalog = catalogNames([{
        id: PRESS, name: 'Low Incline DB Press', aliases: ['Low Incline Dumbbell Press'],
        setCount: 5, exerciseCount: 1, createdAt: '', updatedAt: '',
    }]);

    it('two names sharing a catalogId become one series under the catalog name', () => {
        const index = buildExerciseIndex(merged, PROGRAMS, catalog);
        expect(index.allExerciseNames).toEqual([
            'Leg Press', 'Low Incline DB Press', 'Neutral Grip Pull-Up', 'Treadmill',
        ]);
        expect(index.mostTrainedStrength[0]).toBe('Low Incline DB Press'); // 5 sets

        const series = strengthHistory(merged, 'Low Incline DB Press', null, catalog);
        expect(series.map(s => [s.sessionId, s.bestWeight])).toEqual([[1, 60], [2, 65]]);
        expect(strengthHistory(merged, 'Low Incline Dumbbell Press', null, catalog)).toEqual([]);
    });

    it('records key by the catalog entry', () => {
        const records = personalRecords(merged, 185, NOW, catalog);
        expect(records.map(r => r.exerciseName)).toEqual(['Leg Press', 'Neutral Grip Pull-Up', 'Low Incline DB Press']);
        expect(records[2]).toMatchObject({ weight: 65, reps: 10, date: JUN, estimated1RM: 87 });
    });

    it('active-program names display the catalog name too', () => {
        const programs = PROGRAMS.map(p => ({
            ...p,
            workouts: p.workouts!.map(w => ({
                ...w,
                exercises: w.exercises!.map(e => e.name === 'Low Incline DB Press' ? { ...e, catalogId: PRESS } : e),
            })),
        }));
        expect(buildExerciseIndex(merged, programs, catalog).activeExercises)
            .toEqual(['Low Incline DB Press', 'Leg Press']);
    });

    it('a catalogId with no loaded catalog name falls back to the row name', () => {
        expect(buildExerciseIndex(merged, PROGRAMS)).toEqual(buildExerciseIndex(SESSIONS, PROGRAMS));
    });
});
