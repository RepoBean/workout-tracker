import { useMemo } from 'react';
import { usePrograms } from '../../../shared/api/queries';
import { calculateNextWorkout } from '../../active-session/logic/whatIsNext';

/**
 * Hook to calculate the next workout locally (frontend-only).
 * Uses the active program's currentWorkoutIndex to determine which workout is next.
 * This follows the "Smart Frontend, Dumb Backend" principle.
 */
export function useNextWorkoutLocal() {
    const { data: programs, isLoading, error } = usePrograms();

    const nextWorkout = useMemo(() => {
        if (!programs) return null;

        const activeProgram = programs.find(p => p.isActive && !p.isArchived);
        if (!activeProgram) return null;

        const info = calculateNextWorkout(activeProgram);
        if (!info) return null;

        // Find the full workout object with exercises
        const workout = activeProgram.workouts?.find(w => w.id === info.workoutId);
        if (!workout) return null;

        return {
            program: activeProgram,
            workout,
        };
    }, [programs]);

    return {
        data: nextWorkout,
        isLoading,
        error,
    };
}
