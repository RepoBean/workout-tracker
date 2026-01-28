import { useMemo, useState } from 'react';
import { SetInput } from './SetInput';
import { SwipeableRow } from '../../../shared/ui/SwipeableRow';
import { Button } from '../../../shared/ui/Button';
import type { Exercise, Set } from '../../../shared/api/types';
import type { PreviousExerciseHint } from '../hooks/usePreviousData';

interface ExerciseCardProps {
  exercise: Exercise;
  loggedSets: Set[];
  previousHint?: PreviousExerciseHint;
  onLogSet: (data: {
    exerciseId: number | null;
    exerciseName: string;
    weight: number;
    reps: number;
    setNumber: number;
    perceivedEffort?: number;
    dropIndex?: number;
  }) => void;
  onDeleteSet: (setId: number) => void;
  onUpdateSet?: (setId: number, updates: { weight?: number; reps?: number }) => void;
  isLogging: boolean;
}

interface EditingSet {
  id: number;
  weight: string;
  reps: string;
}

export function ExerciseCard({
  exercise,
  loggedSets,
  previousHint,
  onLogSet,
  onDeleteSet,
  onUpdateSet,
  isLogging,
}: ExerciseCardProps) {
  const [editingSet, setEditingSet] = useState<EditingSet | null>(null);

  // Only count standard sets (dropIndex=0) for completion
  const standardSets = useMemo(
    () => loggedSets.filter(s => (s.dropIndex || 0) === 0),
    [loggedSets]
  );
  const nextSetNumber = standardSets.length + 1;
  const isComplete = standardSets.length >= exercise.targetSets;

  // Get current set by setNumber
  const getLoggedSet = (setNumber: number): Set | undefined => {
    return standardSets.find(s => s.setNumber === setNumber);
  };

  // Get previous set by setNumber
  const getPreviousSet = (setNumber: number) => {
    return previousHint?.sets?.find(s => s.setNumber === setNumber);
  };

  // Parse target reps (handle "8-10" format)
  const hintReps = useMemo(() => {
    const match = exercise.targetReps.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 10;
  }, [exercise.targetReps]);

  // Get hint for current set input - use previous session's matching set
  const currentSetPreviousData = getPreviousSet(nextSetNumber);
  const hintWeight = currentSetPreviousData?.weight
    || (standardSets.length > 0 ? standardSets[standardSets.length - 1].weight : previousHint?.lastWeight || 0);
  const hintRepsForInput = currentSetPreviousData?.reps || hintReps;

  // Get drop sets for display (grouped by setNumber)
  const dropSetsBySetNumber = useMemo(() => {
    const map = new Map<number, Set[]>();
    for (const set of loggedSets) {
      if ((set.dropIndex || 0) > 0) {
        const existing = map.get(set.setNumber) || [];
        map.set(set.setNumber, [...existing, set].sort((a, b) => (a.dropIndex || 0) - (b.dropIndex || 0)));
      }
    }
    return map;
  }, [loggedSets]);

  const handleSetTap = (set: Set) => {
    if (editingSet?.id === set.id || !onUpdateSet) return;
    setEditingSet({
      id: set.id,
      weight: String(set.weight),
      reps: String(set.reps),
    });
  };

  const handleSaveEdit = () => {
    if (!editingSet || !onUpdateSet) return;

    const weight = parseFloat(editingSet.weight);
    const reps = parseInt(editingSet.reps, 10);

    if (!isNaN(weight) && weight >= 0 && !isNaN(reps) && reps > 0) {
      onUpdateSet(editingSet.id, { weight, reps });
    }
    setEditingSet(null);
  };

  // Check if this time is better than last time
  const isBetter = (current: Set, previous: { weight: number; reps: number } | undefined): boolean => {
    if (!previous) return false;
    return current.weight > previous.weight || current.reps > previous.reps;
  };

  return (
    <div className={`card transition-all ${isComplete ? 'ring-2 ring-green-500 dark:ring-green-400' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg truncate">{exercise.name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {exercise.targetSets} sets × {exercise.targetReps} reps
            {exercise.supersetGroup && (
              <span className="ml-2 px-2 py-0.5 bg-purple-100 dark:bg-purple-900
                             text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                Superset {exercise.supersetGroup}
              </span>
            )}
          </p>
        </div>
        {isComplete && (
          <span className="shrink-0 ml-2 px-2 py-1 bg-green-100 dark:bg-green-900
                          text-green-700 dark:text-green-300 text-sm font-medium rounded">
            Complete
          </span>
        )}
      </div>

      {/* Side-by-side comparison grid */}
      <div className="mb-4">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_2fr] gap-2 items-center mb-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="text-right pr-2">Last</div>
          <span></span>
          <div>This time</div>
        </div>

        {/* Set rows */}
        {Array.from({ length: exercise.targetSets }, (_, i) => i + 1).map((setNumber) => {
          const previousSet = getPreviousSet(setNumber);
          const currentSet = getLoggedSet(setNumber);
          const isCurrentRow = setNumber === nextSetNumber;
          const isEditing = editingSet?.id === currentSet?.id;
          const dropSets = dropSetsBySetNumber.get(setNumber) || [];
          const showBetterHighlight = currentSet && isBetter(currentSet, previousSet);

          return (
            <div key={setNumber}>
              {/* Main set row */}
              <div
                className={`grid grid-cols-[1fr_auto_2fr] gap-2 items-center py-1.5 rounded-lg
                           ${isCurrentRow ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                           ${showBetterHighlight ? 'bg-green-50 dark:bg-green-900/10' : ''}`}
              >
                {/* Last time (left - 1/3 width) */}
                <div className="text-right text-gray-500 dark:text-gray-400 text-sm pr-2">
                  {previousSet ? `${previousSet.weight}×${previousSet.reps}` : '—'}
                </div>

                {/* Arrow */}
                <span className="text-gray-400 dark:text-gray-500 text-sm">→</span>

                {/* This time (right) */}
                <div>
                  {currentSet ? (
                    isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editingSet?.weight ?? ''}
                          onChange={(e) => setEditingSet(prev => prev ? { ...prev, weight: e.target.value } : null)}
                          className="w-12 text-center text-sm font-semibold border rounded py-0.5
                                     dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          autoFocus
                        />
                        <span className="text-xs">×</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editingSet?.reps ?? ''}
                          onChange={(e) => setEditingSet(prev => prev ? { ...prev, reps: e.target.value } : null)}
                          className="w-10 text-center text-sm font-semibold border rounded py-0.5
                                     dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                        <Button variant="primary" size="sm" onClick={handleSaveEdit} className="text-xs px-2 py-0.5">
                          ✓
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setEditingSet(null)} className="text-xs px-2 py-0.5">
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <SwipeableRow
                        onSwipeLeft={() => onDeleteSet(currentSet.id)}
                        disabled={currentSet.id < 0}
                      >
                        <span
                          className={`font-medium cursor-pointer ${showBetterHighlight ? 'text-green-600 dark:text-green-400' : 'text-green-600 dark:text-green-400'}`}
                          onClick={() => handleSetTap(currentSet)}
                        >
                          ✓ {currentSet.weight}×{currentSet.reps}
                          {currentSet.perceivedEffort && (
                            <span className="ml-1 text-xs text-gray-500">RPE {currentSet.perceivedEffort}</span>
                          )}
                        </span>
                      </SwipeableRow>
                    )
                  ) : isCurrentRow ? (
                    <span className="text-primary-600 dark:text-primary-400 font-medium text-sm">
                      Set {setNumber}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
                  )}
                </div>
              </div>

              {/* Drop sets (indented, displayed but not editable via UI) */}
              {dropSets.map((dropSet) => (
                <SwipeableRow
                  key={dropSet.id}
                  onSwipeLeft={() => onDeleteSet(dropSet.id)}
                  disabled={dropSet.id < 0}
                >
                  <div className="grid grid-cols-[1fr_auto_2fr] gap-2 items-center py-1 ml-4
                                  bg-orange-50 dark:bg-orange-900/20 rounded-lg mt-1">
                    <div className="text-right text-xs text-gray-400 pr-2">—</div>
                    <span className="text-gray-400 text-xs">↳</span>
                    <span className="text-orange-600 dark:text-orange-400 text-sm">
                      Drop {dropSet.dropIndex}: {dropSet.weight}×{dropSet.reps}
                    </span>
                  </div>
                </SwipeableRow>
              ))}
            </div>
          );
        })}
      </div>

      {/* Set Input (if not complete) */}
      {!isComplete && (
        <SetInput
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          setNumber={nextSetNumber}
          previousWeight={hintWeight}
          previousReps={hintRepsForInput}
          onLogSet={onLogSet}
          isLogging={isLogging}
        />
      )}
    </div>
  );
}
