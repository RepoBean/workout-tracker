import { useState, useEffect, useCallback } from 'react';
import type { Exercise } from '../../../shared/api/types';

interface UseExerciseOrderingParams {
    mergedExercises: Exercise[];
}

interface UseExerciseOrderingResult {
    orderedExercises: Exercise[];
    handleMoveExercise: (fromIndex: number, toIndex: number) => void;
    insertExerciseAt: (exercise: Exercise, position: number) => void;
}

export function useExerciseOrdering({
    mergedExercises,
}: UseExerciseOrderingParams): UseExerciseOrderingResult {
    const [orderedExercises, setOrderedExercises] = useState<Exercise[]>([]);

    // Sync orderedExercises with mergedExercises (single effect to avoid race conditions)
    useEffect(() => {
        if (mergedExercises.length === 0) return;

        setOrderedExercises(prev => {
            if (prev.length === 0) {
                // Initialize: sort by orderIndex on first load
                return [...mergedExercises].sort((a, b) => a.orderIndex - b.orderIndex);
            }
            // Sync: append any new exercises not yet in the ordered list
            const existingIds = new Set(prev.map(e => e.id));
            const newExercises = mergedExercises.filter(e => !existingIds.has(e.id));
            if (newExercises.length > 0) {
                return [...prev, ...newExercises];
            }
            return prev;
        });
    }, [mergedExercises]);

    const handleMoveExercise = useCallback((fromIndex: number, toIndex: number) => {
        setOrderedExercises(prev => {
            const newList = [...prev];
            const [moved] = newList.splice(fromIndex, 1);
            newList.splice(toIndex, 0, moved);
            return newList;
        });
    }, []);

    const insertExerciseAt = useCallback((exercise: Exercise, position: number) => {
        setOrderedExercises(prev => {
            const newList = [...prev];
            newList.splice(position, 0, exercise);
            return newList;
        });
    }, []);

    return {
        orderedExercises,
        handleMoveExercise,
        insertExerciseAt,
    };
}
