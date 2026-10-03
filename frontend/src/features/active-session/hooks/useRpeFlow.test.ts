import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExerciseNavigation } from './useExerciseNavigation';
import { useRpeFlow } from './useRpeFlow';
import type { Exercise, Set } from '../../../shared/api/types';

const SESSION_ID = 77;

function makeExercise(id: number, name: string, orderIndex: number): Exercise {
    return {
        id, workoutId: 1, name, targetSets: 3, targetReps: '8-10', orderIndex,
        supersetGroup: null, exerciseType: 'strength', cardioModality: null,
        targetDurationSec: null, targetDistance: null, catalogId: null, createdAt: '', updatedAt: '',
    };
}

function makeSet(id: number, exercise: Exercise, setNumber: number): Set {
    return {
        id, sessionId: SESSION_ID,
        // Ad-hoc (negative id) exercises store sets with exerciseId null, matched by name.
        exerciseId: exercise.id < 0 ? null : exercise.id,
        exerciseName: exercise.name, weight: 95, reps: 8, setNumber, perceivedEffort: null,
        dropIndex: 0, heartRateAvg: null, heartRateMax: null, durationSec: null, distance: null,
        catalogId: null, createdAt: '', updatedAt: '',
    };
}

function renderFlow(exercises: Exercise[], sets: Set[]) {
    const updateSetsEffort = vi.fn();
    const hook = renderHook(
        ({ sets }) => {
            const navigation = useExerciseNavigation({ exercises, sets, sessionId: SESSION_ID, isReady: true });
            const rpe = useRpeFlow({ sessionId: SESSION_ID, navigation, updateSetsEffort });
            return { navigation, rpe };
        },
        { initialProps: { sets } }
    );
    return { ...hook, updateSetsEffort };
}

describe('useRpeFlow', () => {
    beforeEach(() => localStorage.clear());

    // The 2026-10-02 bug: Barbell RDL swapped to Cable Row and back. The swap-back is a
    // virtual exercise (negative id) named like the hidden program entry; the first set
    // logged on it was read as completing the exercise and the view jumped ahead.
    it('swap-back to a program lift: the first set does not complete it', () => {
        const swappedBack = makeExercise(-1_700_000_000_000, 'Barbell RDL', 2);
        const next = makeExercise(223, 'Chest-Supported Row', 3);
        const { result, rerender } = renderFlow([swappedBack, next], []);

        const first = makeSet(1, swappedBack, 1);
        rerender({ sets: [first] });
        // Called after the POST lands — the set is already in the cache, as in the app.
        act(() => result.current.rpe.handleSetLogged(swappedBack, 0));

        expect(result.current.rpe.rpePromptExercise).toBeNull();
        expect(result.current.navigation.activeExercise?.id).toBe(swappedBack.id);
    });

    it('prompts for RPE on the third set of the swapped-back exercise, against that exercise', () => {
        const swappedBack = makeExercise(-1_700_000_000_000, 'Barbell RDL', 2);
        const { result, rerender } = renderFlow([swappedBack], []);

        const sets = [makeSet(1, swappedBack, 1), makeSet(2, swappedBack, 2)];
        rerender({ sets });
        act(() => result.current.rpe.handleSetLogged(swappedBack, 0));

        expect(result.current.rpe.rpePromptExercise).toEqual({ id: swappedBack.id, name: 'Barbell RDL' });
    });
});
