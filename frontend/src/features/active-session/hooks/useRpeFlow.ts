import { useState, useRef, useCallback, useEffect } from 'react';
import type { Exercise } from '../../../shared/api/types';
import type { UseExerciseNavigationResult } from './useExerciseNavigation';

interface UseRpeFlowParams {
    sessionId: number;
    navigation: UseExerciseNavigationResult;
    updateSetsEffort: (exerciseId: number, effort: number, exerciseName?: string) => void;
    setExerciseNote?: (exerciseName: string, note: string | null) => void;
}

interface UseRpeFlowResult {
    rpePromptExercise: { id: number; name: string } | null;
    /** `exercise` is the card the set was logged on — never re-looked-up by name or id. */
    handleSetLogged: (exercise: Exercise, dropIndex: number) => void;
    handleRpeSubmit: (rpe: number, note: string | null) => void;
    handleRpeSkip: () => void;
}

export function useRpeFlow({
    sessionId,
    navigation,
    updateSetsEffort,
    setExerciseNote,
}: UseRpeFlowParams): UseRpeFlowResult {
    const [rpePromptExercise, setRpePromptExercise] = useState<{ id: number; name: string } | null>(null);
    const completedExercisesRef = useRef<Set<number>>(new Set());

    // Reset completion tracking if the session changes without a remount
    useEffect(() => {
        completedExercisesRef.current = new Set();
    }, [sessionId]);

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

    // Takes the on-screen exercise rather than finding it by name: after swapping back to a
    // lift that is also in the program, a name lookup found the hidden program entry (target
    // 0 in navigation), so the first set read as complete and the view jumped ahead.
    const handleSetLogged = useCallback((exercise: Exercise, dropIndex: number) => {
        const wasComplete = completedExercisesRef.current.has(exercise.id);

        // Predictive check: current count + 1 if we just logged a standard set
        const { logged, target } = navigation.getExerciseProgress(exercise.id);
        const effectiveCount = dropIndex === 0 ? logged + 1 : logged;
        const isNowComplete = effectiveCount >= target;

        if (!wasComplete && isNowComplete) {
            completedExercisesRef.current.add(exercise.id);
            setRpePromptExercise({ id: exercise.id, name: exercise.name });
            return; // Wait for RPE before navigating
        }

        // Not newly complete — handle rotation/advance
        // Compute step completion predictively
        const isStepEffectivelyComplete = (() => {
            if (!navigation.currentStep) return true;
            if (navigation.currentStep.type === 'single') {
                return effectiveCount >= target;
            } else {
                // Superset: all exercises must be complete
                return navigation.currentStep.exercises.every(ex => {
                    if (ex.id === exercise.id) {
                        return effectiveCount >= target;
                    }
                    return navigation.isExerciseComplete(ex.id);
                });
            }
        })();

        if (navigation.currentStep?.type === 'superset') {
            if (isStepEffectivelyComplete) {
                navigation.goToNext();
            } else {
                navigation.rotateSupersetActive();
            }
        } else if (isStepEffectivelyComplete) {
            navigation.goToNext();
        }
    }, [navigation]);

    const handleRpeSubmit = useCallback((rpe: number, note: string | null) => {
        if (rpePromptExercise) {
            // Pass exerciseName for ad-hoc exercises (negative ID) which have null exerciseId in DB
            updateSetsEffort(rpePromptExercise.id, rpe, rpePromptExercise.name);
            if (note !== null && setExerciseNote) {
                setExerciseNote(rpePromptExercise.name, note);
            }
        }
        setRpePromptExercise(null);
        navigateAfterRpe();
    }, [rpePromptExercise, updateSetsEffort, setExerciseNote, navigateAfterRpe]);

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
