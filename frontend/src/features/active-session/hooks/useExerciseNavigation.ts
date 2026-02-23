import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
    sessionId: number;
}

export interface UseExerciseNavigationResult {
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
 *
 * Navigation state is persisted in localStorage to survive mobile tab eviction.
 */
/** Get session-specific storage keys for navigation state */
export function getNavStorageKeys(sessionId: number) {
    return {
        step: `workout-nav-step-${sessionId}`,
        superset: `workout-nav-superset-${sessionId}`,
    };
}

export function useExerciseNavigation({
    exercises: initialExercises,
    sets,
    sessionId,
}: UseExerciseNavigationOptions): UseExerciseNavigationResult {
    // Persist navigation state in localStorage to survive mobile tab eviction
    const { step: storageKey, superset: supersetStorageKey } = getNavStorageKeys(sessionId);

    // Track whether localStorage had a saved value (for smart resume)
    const hadSavedStepIndex = useRef(localStorage.getItem(storageKey) !== null);
    const hasResumedRef = useRef(false);

    const [currentStepIndex, setCurrentStepIndex] = useState(() => {
        const saved = localStorage.getItem(storageKey);
        return saved ? parseInt(saved, 10) : 0;
    });
    const [supersetActiveIndex, setSupersetActiveIndex] = useState(() => {
        const saved = localStorage.getItem(supersetStorageKey);
        return saved ? parseInt(saved, 10) : 0;
    });

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

    // Persist navigation state to sessionStorage when it changes
    useEffect(() => {
        localStorage.setItem(storageKey, String(currentStepIndex));
    }, [currentStepIndex]);

    useEffect(() => {
        localStorage.setItem(supersetStorageKey, String(supersetActiveIndex));
    }, [supersetActiveIndex]);

    // Clamp currentStepIndex if it's out of bounds (e.g., exercises changed)
    useEffect(() => {
        if (steps.length > 0 && currentStepIndex >= steps.length) {
            setCurrentStepIndex(steps.length - 1);
        }
    }, [steps.length, currentStepIndex]);

    // On resume: if no saved navigation state, jump to first incomplete exercise
    useEffect(() => {
        if (hasResumedRef.current) return;
        if (hadSavedStepIndex.current) return;
        if (steps.length === 0) return;
        if (sets.length === 0) return; // Fresh session, step 0 is correct

        hasResumedRef.current = true;

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (step.type === 'single') {
                const exerciseSets = sets.filter(
                    s => (step.exercise.id < 0
                        ? (s.exerciseId === null && s.exerciseName === step.exercise.name)
                        : s.exerciseId === step.exercise.id
                    ) && (s.dropIndex || 0) === 0
                );
                if (exerciseSets.length < step.exercise.targetSets) {
                    setCurrentStepIndex(i);
                    return;
                }
            } else {
                const anyIncomplete = step.exercises.some(ex => {
                    const exSets = sets.filter(
                        s => (ex.id < 0
                            ? (s.exerciseId === null && s.exerciseName === ex.name)
                            : s.exerciseId === ex.id
                        ) && (s.dropIndex || 0) === 0
                    );
                    return exSets.length < ex.targetSets;
                });
                if (anyIncomplete) {
                    setCurrentStepIndex(i);
                    return;
                }
            }
        }

        // All complete — go to last step
        setCurrentStepIndex(steps.length - 1);
    }, [steps, sets]);

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

    // Rotate superset active index — prefers the incomplete exercise with fewest logged sets (round-robin fairness)
    const rotateSupersetActive = useCallback(() => {
        if (!currentStep || currentStep.type !== 'superset') return;

        const len = currentStep.exercises.length;

        // Find the minimum set count among incomplete exercises (excluding current)
        let minSets = Infinity;
        for (let offset = 1; offset < len; offset++) {
            const candidate = (supersetActiveIndex + offset) % len;
            const ex = currentStep.exercises[candidate];
            if (!isExerciseComplete(ex.id)) {
                const { logged } = getExerciseProgress(ex.id);
                if (logged < minSets) minSets = logged;
            }
        }

        // Among those with fewest sets, pick the next one in rotation order
        for (let offset = 1; offset < len; offset++) {
            const candidate = (supersetActiveIndex + offset) % len;
            const ex = currentStep.exercises[candidate];
            if (!isExerciseComplete(ex.id) && getExerciseProgress(ex.id).logged === minSets) {
                setSupersetActiveIndex(candidate);
                return;
            }
        }

        // All others complete — stay on current exercise (do NOT advance to a completed one)
    }, [currentStep, supersetActiveIndex, isExerciseComplete, getExerciseProgress]);

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
