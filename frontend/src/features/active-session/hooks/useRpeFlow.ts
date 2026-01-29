import { useState, useRef, useCallback } from 'react';
import type { Exercise } from '../../../shared/api/types';
import type { UseExerciseNavigationResult } from './useExerciseNavigation';

interface UseRpeFlowParams {
    navigation: UseExerciseNavigationResult;
    mergedExercises: Exercise[];
    updateSetsEffort: (exerciseId: number, effort: number) => void;
}

interface UseRpeFlowResult {
    rpePromptExercise: { id: number; name: string } | null;
    handleSetLogged: (exerciseId: number | null, exerciseName: string) => void;
    handleRpeSubmit: (rpe: number) => void;
    handleRpeSkip: () => void;
}

export function useRpeFlow({
    navigation,
    mergedExercises,
    updateSetsEffort,
}: UseRpeFlowParams): UseRpeFlowResult {
    const [rpePromptExercise, setRpePromptExercise] = useState<{ id: number; name: string } | null>(null);
    const completedExercisesRef = useRef<Set<number>>(new Set());

    // Navigate after RPE prompt (shared logic)
    const navigateAfterRpe = useCallback(() => {
        if (navigation.currentStep?.type === 'superset') {
            if (navigation.isCurrentStepComplete) {
                navigation.goToNext();
            } else {
                navigation.rotateSupersetActive();
            }
        } else {
            navigation.goToNext();
        }
    }, [navigation]);

    const handleSetLogged = useCallback((exerciseId: number | null, exerciseName: string) => {
        const exercise = exerciseId !== null
            ? mergedExercises.find(e => e.id === exerciseId)
            : mergedExercises.find(e => e.name === exerciseName);

        if (!exercise) return;

        const wasComplete = completedExercisesRef.current.has(exercise.id);
        const isNowComplete = navigation.isExerciseComplete(exercise.id);

        if (!wasComplete && isNowComplete) {
            completedExercisesRef.current.add(exercise.id);
            setRpePromptExercise({ id: exercise.id, name: exercise.name });
            return; // Wait for RPE before navigating
        }

        // Not newly complete — handle rotation/advance
        if (navigation.currentStep?.type === 'superset') {
            if (navigation.isCurrentStepComplete) {
                navigation.goToNext();
            } else {
                navigation.rotateSupersetActive();
            }
        } else if (navigation.isCurrentStepComplete) {
            navigation.goToNext();
        }
    }, [mergedExercises, navigation]);

    const handleRpeSubmit = useCallback((rpe: number) => {
        if (rpePromptExercise) {
            updateSetsEffort(rpePromptExercise.id, rpe);
        }
        setRpePromptExercise(null);
        navigateAfterRpe();
    }, [rpePromptExercise, updateSetsEffort, navigateAfterRpe]);

    const handleRpeSkip = useCallback(() => {
        setRpePromptExercise(null);
        navigateAfterRpe();
    }, [navigateAfterRpe]);

    return {
        rpePromptExercise,
        handleSetLogged,
        handleRpeSubmit,
        handleRpeSkip,
    };
}
