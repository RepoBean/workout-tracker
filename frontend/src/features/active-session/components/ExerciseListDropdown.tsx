import { useState, useRef, useCallback, useMemo } from 'react';
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
    // Drag state holds DISPLAY indices (positions in displayList); the
    // parent's select/move callbacks speak underlying indices into
    // `exercises` — translate via entry.idx before calling out.
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartY = useRef(0);
    const listRef = useRef<HTMLDivElement>(null);

    // Display-only partition: completed exercises pinned to the top with
    // their check, remaining work below. Each entry keeps its underlying
    // index, so navigation order and drag persistence are untouched.
    const { displayList, doneCount } = useMemo(() => {
        const done: { ex: Exercise; idx: number }[] = [];
        const todo: { ex: Exercise; idx: number }[] = [];
        exercises.forEach((ex, idx) => {
            (isExerciseComplete(ex.id) ? done : todo).push({ ex, idx });
        });
        return { displayList: [...done, ...todo], doneCount: done.length };
    }, [exercises, isExerciseComplete]);

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

        // Handle drag — hit-test only this dropdown's rows
        if (draggingIndex !== null) {
            const touch = e.touches[0];
            const elements = Array.from(listRef.current?.querySelectorAll('[data-exercise-row]') ?? []);
            let targetIndex = draggingIndex;

            elements.forEach((el, idx) => {
                const rect = el.getBoundingClientRect();
                if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                    targetIndex = idx;
                }
            });

            // Incomplete rows are a contiguous suffix of the display list —
            // clamp so dragging over the pinned completed block can't target it.
            setDragOverIndex(Math.max(targetIndex, doneCount));
        }
    }, [draggingIndex, doneCount]);

    const handleTouchEnd = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        if (draggingIndex !== null && dragOverIndex !== null && draggingIndex !== dragOverIndex) {
            const from = displayList[draggingIndex]?.idx;
            const to = displayList[dragOverIndex]?.idx;
            if (from !== undefined && to !== undefined) {
                onMoveExercise(from, to);
            }
        }

        setDraggingIndex(null);
        setDragOverIndex(null);
    }, [draggingIndex, dragOverIndex, displayList, onMoveExercise]);

    // Takes the UNDERLYING exercise index (pre-translated at the call site)
    const handleRowClick = useCallback((exerciseIndex: number) => {
        if (draggingIndex === null) {
            onSelectExercise(exerciseIndex);
            setIsOpen(false);
        }
    }, [draggingIndex, onSelectExercise]);

    return (
        <div className="mb-4">
            {/* Header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 bg-gray-100 dark:bg-surface-800 
                   rounded-lg hover:bg-gray-200 dark:hover:bg-surface-700 transition-colors"
            >
                <span className="font-medium">
                    All Exercises ({doneCount}/{exercises.length})
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
                    ref={listRef}
                    className="mt-2 bg-white dark:bg-surface-800 rounded-lg border border-gray-200 dark:border-surface-700 overflow-hidden"
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    {displayList.map(({ ex: exercise, idx: exerciseIndex }, displayIndex) => {
                        const progress = getExerciseProgress(exercise.id);
                        const isComplete = displayIndex < doneCount;
                        const isCurrent = exerciseIndex === currentStepIndex;
                        const isDragging = displayIndex === draggingIndex;
                        const isDragOver = displayIndex === dragOverIndex && draggingIndex !== null;

                        return (
                            <div
                                key={exercise.id}
                                data-exercise-row
                                onClick={() => handleRowClick(exerciseIndex)}
                                className={`flex items-center gap-3 p-3 border-b border-gray-100 dark:border-surface-700 
                           last:border-b-0 cursor-pointer transition-all
                           ${isCurrent ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                           ${isDragging ? 'opacity-50 scale-95' : ''}
                           ${isDragOver ? 'border-t-2 border-t-primary-500' : ''}
                           ${!isDragging && !isDragOver ? 'hover:bg-gray-50 dark:hover:bg-surface-700' : ''}`}
                            >
                                {/* Drag handle — long-press here to drag; touch-none keeps the
                                    page from scrolling. Completed rows are pinned to the top and
                                    not draggable: spacer keeps the text column aligned. */}
                                {isComplete ? (
                                    <div className="w-5 p-2 -m-2" aria-hidden="true" />
                                ) : (
                                    <div
                                        className="text-gray-400 dark:text-gray-500 touch-none p-2 -m-2"
                                        onTouchStart={(e) => handleTouchStart(e, displayIndex)}
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M4 8h16M4 16h16" />
                                        </svg>
                                    </div>
                                )}

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
