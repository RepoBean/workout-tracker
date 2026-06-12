import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExerciseNavigation, getNavStorageKeys } from './useExerciseNavigation';
import type { Exercise, Set } from '../../../shared/api/types';

const SESSION_ID = 42;

function makeExercise(id: number, name: string, orderIndex: number): Exercise {
    return {
        id,
        workoutId: 1,
        name,
        targetSets: 3,
        targetReps: '8-10',
        orderIndex,
        supersetGroup: null,
        exerciseType: 'strength',
        cardioModality: null,
        targetDurationSec: null,
        targetDistance: null,
        createdAt: '',
        updatedAt: '',
    };
}

function makeSet(id: number, exercise: Exercise, setNumber: number): Set {
    return {
        id,
        sessionId: SESSION_ID,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        weight: 100,
        reps: 8,
        setNumber,
        perceivedEffort: null,
        dropIndex: 0,
        heartRateAvg: null,
        heartRateMax: null,
        durationSec: null,
        distance: null,
        createdAt: '',
        updatedAt: '',
    };
}

const benchPress = makeExercise(1, 'Bench Press', 0);
const inclinePress = makeExercise(2, 'Incline Press', 1);
const cableFly = makeExercise(3, 'Cable Fly', 2);
const exercises = [benchPress, inclinePress, cableFly];

interface HookProps {
    exercises: Exercise[];
    sets: Set[];
    isReady: boolean;
}

function renderNavigation(initialProps: HookProps) {
    return renderHook(
        (props: HookProps) => useExerciseNavigation({ ...props, sessionId: SESSION_ID }),
        { initialProps }
    );
}

describe('useExerciseNavigation resume behavior', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('stays on a manually chosen exercise after logging the first set of a fresh session', () => {
        const { result, rerender } = renderNavigation({ exercises, sets: [], isReady: true });

        // First machine occupied — user skips ahead to the third exercise
        act(() => result.current.goToStep(2));
        expect(result.current.currentStepIndex).toBe(2);

        // Logging the first set must not bounce navigation back to step 0
        rerender({ exercises, sets: [makeSet(1, cableFly, 1)], isReady: true });
        expect(result.current.currentStepIndex).toBe(2);
    });

    it('jumps to the first incomplete exercise on resume without saved nav state', () => {
        const sets = [1, 2, 3].map(n => makeSet(n, benchPress, n)); // exercise 1 complete
        const { result } = renderNavigation({ exercises, sets, isReady: true });

        expect(result.current.currentStepIndex).toBe(1);
    });

    it('keeps the saved position on resume when nav state exists', () => {
        localStorage.setItem(getNavStorageKeys(SESSION_ID).step, '2');
        const sets = [1, 2, 3].map(n => makeSet(n, benchPress, n)); // exercise 1 complete
        const { result } = renderNavigation({ exercises, sets, isReady: true });

        expect(result.current.currentStepIndex).toBe(2);
    });

    it('defers the resume decision until session data and steps have loaded', () => {
        const sets = [1, 2, 3].map(n => makeSet(n, benchPress, n));
        const { result, rerender } = renderNavigation({ exercises: [], sets: [], isReady: false });

        // Session loads before orderedExercises state syncs (real loading sequence)
        rerender({ exercises: [], sets, isReady: true });
        expect(result.current.currentStepIndex).toBe(0);

        rerender({ exercises, sets, isReady: true });
        expect(result.current.currentStepIndex).toBe(1);
    });
});
