import { useState, useRef, useCallback } from 'react';
import type { Exercise } from '../../../shared/api/types';

interface ExerciseListDropdownProps {
    exercises: Exercise[];
    currentStepIndex: number;
    getExerciseProgress: (exerciseId: number) => { logged: number; target: number };
    isExerciseComplete: (exerciseId: number) => boolean;
    onSelectExercise: (exerciseIndex: number) => void;
    onMoveExercise: (fromIndex: number, toIndex: number) => void;
}

/**
 * Collapsible dropdown showing all exercises with progress and reorder capability
 */
export function ExerciseListDropdown({
    exercises,
    currentStepIndex,
    getExerciseProgress,
    isExerciseComplete,
    onSelectExercise,
    onMoveExercise,
}: ExerciseListDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartY = useRef(0);

    const handleTouchStart = useCallback((e: React.TouchEvent, index: number) => {
        touchStartY.current = e.touches[0].clientY;
        longPressTimer.current = setTimeout(() => {
            setDraggingIndex(index);
            // Vibrate if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 500);
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        // Cancel long press if moved significantly
        if (longPressTimer.current) {
            const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
            if (dy > 10 && draggingIndex === null) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        }

        // Handle drag
        if (draggingIndex !== null) {
            e.preventDefault();
            const touch = e.touches[0];
            const elements = document.querySelectorAll('[data-exercise-row]');
            let targetIndex = draggingIndex;

            elements.forEach((el, idx) => {
                const rect = el.getBoundingClientRect();
                if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                    targetIndex = idx;
                }
            });

            setDragOverIndex(targetIndex);
        }
    }, [draggingIndex]);

    const handleTouchEnd = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        if (draggingIndex !== null && dragOverIndex !== null && draggingIndex !== dragOverIndex) {
            onMoveExercise(draggingIndex, dragOverIndex);
        }

        setDraggingIndex(null);
        setDragOverIndex(null);
    }, [draggingIndex, dragOverIndex, onMoveExercise]);

    const handleRowClick = useCallback((index: number) => {
        if (draggingIndex === null) {
            onSelectExercise(index);
            setIsOpen(false);
        }
    }, [draggingIndex, onSelectExercise]);

    const completedCount = exercises.filter(ex => isExerciseComplete(ex.id)).length;

    return (
        <div className="mb-4">
            {/* Header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 bg-gray-100 dark:bg-surface-800 
                   rounded-lg hover:bg-gray-200 dark:hover:bg-surface-700 transition-colors"
            >
                <span className="font-medium">
                    All Exercises ({completedCount}/{exercises.length})
                </span>
                <svg
                    className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown List */}
            {isOpen && (
                <div
                    className="mt-2 bg-white dark:bg-surface-800 rounded-lg border border-gray-200 dark:border-surface-700 overflow-hidden"
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    {exercises.map((exercise, index) => {
                        const progress = getExerciseProgress(exercise.id);
                        const isComplete = isExerciseComplete(exercise.id);
                        const isCurrent = index === currentStepIndex;
                        const isDragging = index === draggingIndex;
                        const isDragOver = index === dragOverIndex && draggingIndex !== null;

                        return (
                            <div
                                key={exercise.id}
                                data-exercise-row
                                onTouchStart={(e) => handleTouchStart(e, index)}
                                onClick={() => handleRowClick(index)}
                                className={`flex items-center gap-3 p-3 border-b border-gray-100 dark:border-surface-700 
                           last:border-b-0 cursor-pointer transition-all
                           ${isCurrent ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                           ${isDragging ? 'opacity-50 scale-95' : ''}
                           ${isDragOver ? 'border-t-2 border-t-primary-500' : ''}
                           ${!isDragging && !isDragOver ? 'hover:bg-gray-50 dark:hover:bg-surface-700' : ''}`}
                            >
                                {/* Drag handle */}
                                <div className="text-gray-400 dark:text-gray-500 touch-none">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M4 8h16M4 16h16" />
                                    </svg>
                                </div>

                                {/* Exercise info */}
                                <div className="flex-1 min-w-0">
                                    <div className={`font-medium truncate ${isCurrent ? 'text-primary-600 dark:text-primary-400' : ''}`}>
                                        {exercise.name}
                                    </div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                        {progress.logged}/{progress.target} sets
                                        {exercise.supersetGroup && (
                                            <span className="ml-2 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 
                                       text-purple-700 dark:text-purple-300 rounded text-xs">
                                                {exercise.supersetGroup}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Completion indicator */}
                                {isComplete && (
                                    <div className="shrink-0">
                                        <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
