import { useMemo } from 'react';
import { useHistory, usePrograms } from '../../../shared/api/queries';
import type { Session, Set } from '../../../shared/api/types';

export interface ExerciseSession {
    sessionId: number;
    date: string;           // completedAt
    workoutName: string;
    sets: Array<{ weight: number; reps: number; setNumber: number }>;
    bestWeight: number;     // heaviest weight in this session
}

export interface UseProgressDataReturn {
    isLoading: boolean;
    error: Error | null;

    // For exercise picker
    allExerciseNames: string[];           // Unique exercise names from history
    mostTrainedExercises: string[];       // Top 5 by frequency
    activeExercises: string[];            // Exercises from active program

    // For chart/list
    getExerciseHistory: (name: string) => ExerciseSession[];
}

export function useProgressData(): UseProgressDataReturn {
    const { data: sessions, isLoading: historyLoading, error: historyError } = useHistory(200, 0);
    const { data: programs, isLoading: programsLoading } = usePrograms();

    // Derive unique exercise names from history
    const allExerciseNames = useMemo(() => {
        if (!sessions) return [];
        const names = new Set<string>();
        sessions.forEach((session: Session) => {
            session.sets?.forEach((set: Set) => {
                if (set.exerciseName) {
                    names.add(set.exerciseName);
                }
            });
        });
        return Array.from(names).sort();
    }, [sessions]);

    // Derive top 5 most trained exercises by frequency
    const mostTrainedExercises = useMemo(() => {
        if (!sessions) return [];
        const counts = new Map<string, number>();
        sessions.forEach((session: Session) => {
            session.sets?.forEach((set: Set) => {
                if (set.exerciseName) {
                    counts.set(set.exerciseName, (counts.get(set.exerciseName) || 0) + 1);
                }
            });
        });
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name);
    }, [sessions]);

    // Derive exercises from active program
    const activeExercises = useMemo(() => {
        if (!programs) return [];
        const activeProgram = programs.find(p => p.isActive);
        if (!activeProgram?.workouts) return [];

        const names = new Set<string>();
        activeProgram.workouts.forEach(workout => {
            workout.exercises?.forEach(exercise => {
                names.add(exercise.name);
            });
        });
        return Array.from(names);
    }, [programs]);

    // Get exercise history for chart/list
    const getExerciseHistory = useMemo(() => {
        return (name: string): ExerciseSession[] => {
            if (!sessions) return [];

            const result: ExerciseSession[] = [];

            sessions.forEach((session: Session) => {
                // Only include completed sessions
                if (!session.completedAt) return;

                const exerciseSets = session.sets?.filter(
                    (set: Set) => set.exerciseName === name
                ) || [];

                if (exerciseSets.length === 0) return;

                const weights = exerciseSets.map(s => s.weight);
                const bestWeight = Math.max(...weights);

                result.push({
                    sessionId: session.id,
                    date: session.completedAt,
                    workoutName: session.workoutName,
                    sets: exerciseSets.map(s => ({
                        weight: s.weight,
                        reps: s.reps,
                        setNumber: s.setNumber,
                    })),
                    bestWeight,
                });
            });

            // Sort by date ascending for chart (oldest first)
            return result.sort((a, b) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
            );
        };
    }, [sessions]);

    return {
        isLoading: historyLoading || programsLoading,
        error: historyError,
        allExerciseNames,
        mostTrainedExercises,
        activeExercises,
        getExerciseHistory,
    };
}
