import { useState, useEffect, useCallback } from 'react';
import type { Exercise } from '../../../shared/api/types';

export function getOrderStorageKey(sessionId: number): string {
    return `workout-exercise-order-${sessionId}`;
}

export function getHiddenStorageKey(sessionId: number): string {
    return `hidden-exercises-${sessionId}`;
}

interface UseExerciseOrderingParams {
    mergedExercises: Exercise[];
    sessionId: number;
    isReady: boolean;
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
    isReady,
}: UseExerciseOrderingParams): UseExerciseOrderingResult {
    const [orderedExercises, setOrderedExercises] = useState<Exercise[]>([]);
    const [hiddenExerciseIds, setHiddenExerciseIds] = useState<Set<number>>(() => {
        const stored = localStorage.getItem(getHiddenStorageKey(sessionId));
        if (!stored) return new Set();
        return new Set(JSON.parse(stored) as number[]);
    });

    // Persist hidden exercises to localStorage
    useEffect(() => {
        if (hiddenExerciseIds.size > 0) {
            localStorage.setItem(
                getHiddenStorageKey(sessionId),
                JSON.stringify([...hiddenExerciseIds])
            );
        } else {
            localStorage.removeItem(getHiddenStorageKey(sessionId));
        }
    }, [hiddenExerciseIds, sessionId]);

    // Sync orderedExercises with mergedExercises, restoring from localStorage on initialization
    useEffect(() => {
        if (!isReady) return;
        if (mergedExercises.length === 0) return;

        // Filter out exercises that were swapped out / hidden
        const visibleExercises = mergedExercises.filter(e => !hiddenExerciseIds.has(e.id));

        setOrderedExercises(prev => {
            if (prev.length > 0) {
                // Already initialized: preserve local modifications (like supersetGroup nulling or swaps)
                // Just append any new exercises not yet in the ordered list
                const existingIds = new Set(prev.map(e => e.id));
                const newExercises = visibleExercises.filter(e => !existingIds.has(e.id));
                if (newExercises.length > 0) {
                    return [...prev, ...newExercises];
                }
                return prev;
            }

            // Check localStorage for saved order
            const savedOrderJson = localStorage.getItem(getOrderStorageKey(sessionId));
            const savedOrder: number[] | null = savedOrderJson ? JSON.parse(savedOrderJson) : null;

            if (savedOrder && savedOrder.length > 0) {
                // Restore saved order, appending any new exercises
                const exerciseMap = new Map(visibleExercises.map(e => [e.id, e]));
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

            // Initialize: sort by orderIndex on first load
            return [...visibleExercises].sort((a, b) => a.orderIndex - b.orderIndex);
        });
    }, [mergedExercises, sessionId, hiddenExerciseIds, isReady]);

    // Persist ordering to localStorage when it changes
    useEffect(() => {
        if (!isReady) return;
        if (orderedExercises.length > 0) {
            localStorage.setItem(
                getOrderStorageKey(sessionId),
                JSON.stringify(orderedExercises.map(e => e.id))
            );
        }
    }, [orderedExercises, sessionId, isReady]);

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
        // Mark the old exercise as hidden so it doesn't reappear on reload
        setHiddenExerciseIds(prev => new Set([...prev, oldExerciseId]));

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
