import { useState, useMemo, useCallback, useEffect } from 'react';
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
    /** Reorder exercises (session-local only) */
    moveExercise: (fromIndex: number, toIndex: number) => void;
    /** Insert a new exercise at current position */
    insertExercise: (exercise: Exercise) => void;
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
    // Local exercise order (for session-only reordering)
    const [exerciseOrder, setExerciseOrder] = useState<number[]>(() =>
        initialExercises.map(e => e.id)
    );

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

    // Sync exerciseOrder when initialExercises changes (to pick up dynamically added exercises)
    useEffect(() => {
        setExerciseOrder(current => {
            const currentIds = new Set(current);
            const newExercises = initialExercises.filter(ex => !currentIds.has(ex.id));
            if (newExercises.length > 0) {
                // Append new exercises to the end (they'll be inserted at correct position by insertExercise)
                return [...current, ...newExercises.map(ex => ex.id)];
            }
            return current;
        });
    }, [initialExercises]);

    // Ordered exercises based on local order
    const orderedExercises = useMemo(() => {
        // Start with the current order, filter to only include exercises that still exist
        const ordered: Exercise[] = [];
        for (const id of exerciseOrder) {
            const ex = exerciseMap.get(id);
            if (ex) ordered.push(ex);
        }
        // Add any new exercises not in the order
        for (const ex of initialExercises) {
            if (!exerciseOrder.includes(ex.id)) {
                ordered.push(ex);
            }
        }
        return ordered;
    }, [exerciseOrder, exerciseMap, initialExercises]);

    // Build navigation steps from ordered exercises
    const steps = useMemo(() => {
        const result: NavigationStep[] = [];
        let i = 0;

        while (i < orderedExercises.length) {
            const exercise = orderedExercises[i];

            // Check if this starts a superset group
            if (exercise.supersetGroup) {
                const group = exercise.supersetGroup;
                const supersetExercises: Exercise[] = [exercise];

                // Collect consecutive exercises with the same supersetGroup
                let j = i + 1;
                while (j < orderedExercises.length && orderedExercises[j].supersetGroup === group) {
                    supersetExercises.push(orderedExercises[j]);
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
    }, [orderedExercises]);

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

    // Reorder exercises
    const moveExercise = useCallback((fromIndex: number, toIndex: number) => {
        setExerciseOrder(current => {
            const newOrder = [...current];
            const [moved] = newOrder.splice(fromIndex, 1);
            newOrder.splice(toIndex, 0, moved);
            return newOrder;
        });
    }, []);

    // Insert a new exercise at the current position
    const insertExercise = useCallback((exercise: Exercise) => {
        setExerciseOrder(current => {
            // If already in the order, don't duplicate
            if (current.includes(exercise.id)) {
                return current;
            }

            // Calculate the flat exercise index for current step
            let insertPosition = 0;
            for (let i = 0; i < currentStepIndex && i < steps.length; i++) {
                const step = steps[i];
                insertPosition += step.type === 'single' ? 1 : step.exercises.length;
            }

            // Insert at the calculated position
            const newOrder = [...current];
            newOrder.splice(insertPosition, 0, exercise.id);
            return newOrder;
        });
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
        moveExercise,
        insertExercise,
        rotateSupersetActive,
        isExerciseComplete,
        isCurrentStepComplete,
        getSetsForExercise,
        getExerciseProgress,
    };
}
