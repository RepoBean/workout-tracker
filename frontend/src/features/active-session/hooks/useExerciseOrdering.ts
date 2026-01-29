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

    // Initialize from mergedExercises (sorted by orderIndex) on first load
    useEffect(() => {
        if (orderedExercises.length === 0 && mergedExercises.length > 0) {
            setOrderedExercises(
                [...mergedExercises].sort((a, b) => a.orderIndex - b.orderIndex)
            );
        }
    }, [mergedExercises, orderedExercises.length]);

    // Sync: add new exercises that appear in mergedExercises but not in orderedExercises
    useEffect(() => {
        const orderedIds = new Set(orderedExercises.map(e => e.id));
        const newExercises = mergedExercises.filter(e => !orderedIds.has(e.id));
        if (newExercises.length > 0) {
            setOrderedExercises(prev => [...prev, ...newExercises]);
        }
    }, [mergedExercises, orderedExercises]);

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
