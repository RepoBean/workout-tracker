import { useState, useMemo, useCallback } from 'react';
import type { Exercise, Set } from '../../../shared/api/types';

/**
 * A navigation "step" - either a single exercise or a superset group
 */
export type NavigationStep =
    | { type: 'single'; exercise: Exercise }
    | { type: 'superset'; exercises: Exercise[]; group: string };

interface UseExerciseNavigationOptions {
    exercises: Exercise[];
    sets: Set[];
}

interface UseExerciseNavigationResult {
    /** All navigation steps */
    steps: NavigationStep[];
    /** Current step index */
    currentStepIndex: number;
    /** For superset steps, which exercise is currently active */
    supersetActiveIndex: number;
    /** Current step */
    currentStep: NavigationStep | null;
    /** The currently active exercise (the one that should receive the next set) */
    activeExercise: Exercise | null;
    /** Navigate to next step */
    goToNext: () => void;
    /** Navigate to previous step */
    goToPrevious: () => void;
    /** Jump to a specific step */
    goToStep: (index: number) => void;
    /** Get the flat exercise index for the current step (for insertion) */
    getCurrentFlatIndex: () => number;
    /** Advance to next exercise in superset (called after logging a set) */
    rotateSupersetActive: () => void;
    /** Check if exercise is complete (all target sets logged) */
    isExerciseComplete: (exerciseId: number) => boolean;
    /** Check if current step is complete */
    isCurrentStepComplete: boolean;
    /** Get sets for a given exercise */
    getSetsForExercise: (exerciseId: number) => Set[];
    /** Get progress for an exercise */
    getExerciseProgress: (exerciseId: number) => { logged: number; target: number };
}

/**
 * Hook for focused exercise navigation with superset support
 * 
 * Consecutive exercises with the same non-null supersetGroup are grouped into one step.
 * Auto-advancing and superset rotation are handled via callback functions.
 */
export function useExerciseNavigation({
    exercises: initialExercises,
    sets,
}: UseExerciseNavigationOptions): UseExerciseNavigationResult {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [supersetActiveIndex, setSupersetActiveIndex] = useState(0);

    // Map exercise IDs to exercises for quick lookup
    const exerciseMap = useMemo(() => {
        const map = new Map<number, Exercise>();
        for (const ex of initialExercises) {
            map.set(ex.id, ex);
        }
        return map;
    }, [initialExercises]);

    // Note: initialExercises is already ordered by the parent component

    // Build navigation steps from exercises (already ordered by parent)
    const steps = useMemo(() => {
        const result: NavigationStep[] = [];
        let i = 0;

        while (i < initialExercises.length) {
            const exercise = initialExercises[i];

            // Check if this starts a superset group
            if (exercise.supersetGroup) {
                const group = exercise.supersetGroup;
                const supersetExercises: Exercise[] = [exercise];

                // Collect consecutive exercises with the same supersetGroup
                let j = i + 1;
                while (j < initialExercises.length && initialExercises[j].supersetGroup === group) {
                    supersetExercises.push(initialExercises[j]);
                    j++;
                }

                if (supersetExercises.length > 1) {
                    result.push({ type: 'superset', exercises: supersetExercises, group });
                    i = j;
                    continue;
                }
            }

            // Single exercise step
            result.push({ type: 'single', exercise });
            i++;
        }

        return result;
    }, [initialExercises]);

    // Get sets for a specific exercise (only standard sets, sorted)
    // For ad-hoc exercises (negative ID), look up by exerciseName
    const getSetsForExercise = useCallback((exerciseId: number): Set[] => {
        const exercise = exerciseMap.get(exerciseId);

        if (exerciseId < 0 && exercise) {
            // Ad-hoc exercise: find sets by exerciseName where exerciseId is null
            return sets
                .filter(s => s.exerciseId === null && s.exerciseName === exercise.name)
                .sort((a, b) => a.setNumber - b.setNumber || (a.dropIndex || 0) - (b.dropIndex || 0));
        }

        return sets
            .filter(s => s.exerciseId === exerciseId)
            .sort((a, b) => a.setNumber - b.setNumber || (a.dropIndex || 0) - (b.dropIndex || 0));
    }, [sets, exerciseMap]);

    // Check if an exercise is complete
    // For ad-hoc exercises (negative ID), look up by exerciseName
    const isExerciseComplete = useCallback((exerciseId: number): boolean => {
        const exercise = exerciseMap.get(exerciseId);
        if (!exercise) return false;

        let standardSets: Set[];
        if (exerciseId < 0) {
            // Ad-hoc exercise: find sets by exerciseName where exerciseId is null
            standardSets = sets.filter(
                s => s.exerciseId === null && s.exerciseName === exercise.name && (s.dropIndex || 0) === 0
            );
        } else {
            standardSets = sets.filter(s => s.exerciseId === exerciseId && (s.dropIndex || 0) === 0);
        }

        return standardSets.length >= exercise.targetSets;
    }, [sets, exerciseMap]);

    // Get progress for an exercise
    // For ad-hoc exercises (negative ID), look up by exerciseName
    const getExerciseProgress = useCallback((exerciseId: number): { logged: number; target: number } => {
        const exercise = exerciseMap.get(exerciseId);
        if (!exercise) return { logged: 0, target: 0 };

        let standardSets: Set[];
        if (exerciseId < 0) {
            // Ad-hoc exercise: find sets by exerciseName where exerciseId is null
            standardSets = sets.filter(
                s => s.exerciseId === null && s.exerciseName === exercise.name && (s.dropIndex || 0) === 0
            );
        } else {
            standardSets = sets.filter(s => s.exerciseId === exerciseId && (s.dropIndex || 0) === 0);
        }

        return { logged: standardSets.length, target: exercise.targetSets };
    }, [sets, exerciseMap]);

    // Current step
    const currentStep = steps[currentStepIndex] || null;

    // Check if current step is complete
    const isCurrentStepComplete = useMemo(() => {
        if (!currentStep) return true;

        if (currentStep.type === 'single') {
            return isExerciseComplete(currentStep.exercise.id);
        } else {
            return currentStep.exercises.every(ex => isExerciseComplete(ex.id));
        }
    }, [currentStep, isExerciseComplete]);

    // Active exercise (the one that should receive the next set)
    const activeExercise = useMemo(() => {
        if (!currentStep) return null;

        if (currentStep.type === 'single') {
            return currentStep.exercise;
        } else {
            // For superset, return the exercise at supersetActiveIndex (wrapped)
            const idx = supersetActiveIndex % currentStep.exercises.length;
            return currentStep.exercises[idx];
        }
    }, [currentStep, supersetActiveIndex]);

    // Navigation functions
    const goToNext = useCallback(() => {
        if (currentStepIndex < steps.length - 1) {
            setCurrentStepIndex(i => i + 1);
            setSupersetActiveIndex(0);
        }
    }, [currentStepIndex, steps.length]);

    const goToPrevious = useCallback(() => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(i => i - 1);
            setSupersetActiveIndex(0);
        }
    }, [currentStepIndex]);

    const goToStep = useCallback((index: number) => {
        if (index >= 0 && index < steps.length) {
            setCurrentStepIndex(index);
            setSupersetActiveIndex(0);
        }
    }, [steps.length]);

    // Get the flat exercise index for the current step (for parent's insertion logic)
    const getCurrentFlatIndex = useCallback((): number => {
        let index = 0;
        for (let i = 0; i < currentStepIndex && i < steps.length; i++) {
            const step = steps[i];
            index += step.type === 'single' ? 1 : step.exercises.length;
        }
        return index;
    }, [currentStepIndex, steps]);

    // Rotate superset active index (called after logging a set)
    const rotateSupersetActive = useCallback(() => {
        if (!currentStep || currentStep.type !== 'superset') return;

        const nextIndex = (supersetActiveIndex + 1) % currentStep.exercises.length;
        setSupersetActiveIndex(nextIndex);
    }, [currentStep, supersetActiveIndex]);

    return {
        steps,
        currentStepIndex,
        supersetActiveIndex,
        currentStep,
        activeExercise,
        goToNext,
        goToPrevious,
        goToStep,
        getCurrentFlatIndex,
        rotateSupersetActive,
        isExerciseComplete,
        isCurrentStepComplete,
        getSetsForExercise,
        getExerciseProgress,
    };
}
