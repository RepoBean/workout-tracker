import { useState, useEffect, useCallback } from 'react';
import type { Exercise } from '../../../shared/api/types';

export function getOrderStorageKey(sessionId: number): string {
    return `workout-exercise-order-${sessionId}`;
}

interface UseExerciseOrderingParams {
    mergedExercises: Exercise[];
    sessionId: number;
}

interface UseExerciseOrderingResult {
    orderedExercises: Exercise[];
    handleMoveExercise: (fromIndex: number, toIndex: number) => void;
    insertExerciseAt: (exercise: Exercise, position: number) => void;
    swapExercise: (oldExerciseId: number, newExercise: Exercise) => void;
    updateExerciseInOrder: (exerciseId: number, updates: Partial<Exercise>) => void;
}

export function useExerciseOrdering({
    mergedExercises,
    sessionId,
}: UseExerciseOrderingParams): UseExerciseOrderingResult {
    const [orderedExercises, setOrderedExercises] = useState<Exercise[]>([]);

    // Sync orderedExercises with mergedExercises, restoring from localStorage if available
    useEffect(() => {
        if (mergedExercises.length === 0) return;

        setOrderedExercises(prev => {
            // Check localStorage for saved order
            const savedOrderJson = localStorage.getItem(getOrderStorageKey(sessionId));
            const savedOrder: number[] | null = savedOrderJson ? JSON.parse(savedOrderJson) : null;

            if (savedOrder && savedOrder.length > 0) {
                // Restore saved order, appending any new exercises
                const exerciseMap = new Map(mergedExercises.map(e => [e.id, e]));
                const ordered: Exercise[] = [];
                for (const id of savedOrder) {
                    const ex = exerciseMap.get(id);
                    if (ex) {
                        ordered.push(ex);
                        exerciseMap.delete(id);
                    }
                }
                // Append any exercises not in saved order
                for (const ex of exerciseMap.values()) {
                    ordered.push(ex);
                }
                return ordered;
            }

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
    }, [mergedExercises, sessionId]);

    // Persist ordering to localStorage when it changes
    useEffect(() => {
        if (orderedExercises.length > 0) {
            localStorage.setItem(
                getOrderStorageKey(sessionId),
                JSON.stringify(orderedExercises.map(e => e.id))
            );
        }
    }, [orderedExercises, sessionId]);

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

    const swapExercise = useCallback((oldExerciseId: number, newExercise: Exercise) => {
        setOrderedExercises(prev => {
            const idx = prev.findIndex(e => e.id === oldExerciseId);
            if (idx === -1) return prev;
            const oldExercise = prev[idx];
            const newList = [...prev];
            newList[idx] = {
                ...newExercise,
                supersetGroup: oldExercise.supersetGroup,
            };
            return newList;
        });
    }, []);

    const updateExerciseInOrder = useCallback((exerciseId: number, updates: Partial<Exercise>) => {
        setOrderedExercises(prev =>
            prev.map(e => e.id === exerciseId ? { ...e, ...updates } : e)
        );
    }, []);

    return {
        orderedExercises,
        handleMoveExercise,
        insertExerciseAt,
        swapExercise,
        updateExerciseInOrder,
    };
}
