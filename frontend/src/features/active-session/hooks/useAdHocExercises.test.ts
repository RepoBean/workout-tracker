import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAdHocExercises, getAdHocBlankStorageKey, hashName } from './useAdHocExercises';
import type { Set as SetType } from '../../../shared/api/types';

const SESSION_ID = 7;

function makeAdHocSet(
    id: number,
    name: string,
    setNumber: number,
    overrides: Partial<SetType> = {}
): SetType {
    return {
        id,
        sessionId: SESSION_ID,
        exerciseId: null,
        exerciseName: name,
        weight: 135,
        reps: 5,
        setNumber,
        perceivedEffort: null,
        dropIndex: 0,
        heartRateAvg: null,
        heartRateMax: null,
        durationSec: null,
        distance: null,
        createdAt: '',
        updatedAt: '',
        ...overrides,
    };
}

function renderBlank(sets: SetType[] = []) {
    return renderHook(() =>
        useAdHocExercises({
            sessionId: SESSION_ID,
            session: { workoutId: null },
            exercises: [],
            sets,
        })
    );
}

function seedBlankList(items: Array<Record<string, unknown>>) {
    localStorage.setItem(getAdHocBlankStorageKey(SESSION_ID), JSON.stringify(items));
}

describe('useAdHocExercises blank-session merged exercises', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('exposes blank-list exercises as virtual Exercises keyed by hashName', () => {
        seedBlankList([{ tempId: 'adhoc-1', name: 'Squat' }]);
        const { result } = renderBlank();

        expect(result.current.mergedExercises).toHaveLength(1);
        const ex = result.current.mergedExercises[0];
        expect(ex.name).toBe('Squat');
        expect(ex.id).toBe(hashName('Squat'));
        expect(ex.id).toBeLessThan(0);
        expect(ex.orderIndex).toBe(0);
        expect(ex.exerciseType).toBe('strength');
        expect(ex.targetSets).toBe(3);
    });

    it('marks a cardio blank entry with targetSets 1', () => {
        seedBlankList([
            { tempId: 'adhoc-c', name: 'Run', exerciseType: 'cardio', cardioModality: 'running' },
        ]);
        const { result } = renderBlank();

        const ex = result.current.mergedExercises[0];
        expect(ex.exerciseType).toBe('cardio');
        expect(ex.targetSets).toBe(1);
        expect(ex.cardioModality).toBe('running');
    });

    it('includes logged-set-only ad-hoc exercises in merged exercises', () => {
        const { result } = renderBlank([makeAdHocSet(1, 'Deadlift', 1)]);
        expect(result.current.mergedExercises.map(e => e.name)).toEqual(['Deadlift']);
    });

    it('infers cardio for a logged-set-only ad-hoc exercise with duration', () => {
        const { result } = renderBlank([
            makeAdHocSet(1, 'Row', 1, { durationSec: 600, weight: 0, reps: 0 }),
        ]);
        const ex = result.current.mergedExercises[0];
        expect(ex.exerciseType).toBe('cardio');
        expect(ex.targetSets).toBe(1);
    });

    it('collapses a blank entry and a matching logged set into one stable exercise', () => {
        seedBlankList([{ tempId: 'adhoc-s', name: 'Squat' }]);
        const { result } = renderBlank([makeAdHocSet(1, 'squat', 1)]);

        expect(result.current.mergedExercises).toHaveLength(1);
        // Reconstruction uses the logged set's display case ('squat')
        expect(result.current.mergedExercises[0].id).toBe(hashName('squat'));
    });
});
