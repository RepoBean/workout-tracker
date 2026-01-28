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

interface DropSetMode {
  setNumber: number;
  nextDropIndex: number;
  lastWeight: number;
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
  const [dropSetMode, setDropSetMode] = useState<DropSetMode | null>(null);
  const [editingSet, setEditingSet] = useState<EditingSet | null>(null);

  // Only count standard sets (dropIndex=0) for completion
  const standardSets = useMemo(
    () => loggedSets.filter(s => (s.dropIndex || 0) === 0),
    [loggedSets]
  );
  const nextSetNumber = standardSets.length + 1;
  const isComplete = standardSets.length >= exercise.targetSets;

  // Group sets by setNumber for display
  const setGroups = useMemo(() => {
    const groups = new Map<number, Set[]>();
    for (const set of loggedSets) {
      const existing = groups.get(set.setNumber) || [];
      groups.set(set.setNumber, [...existing, set].sort((a, b) => (a.dropIndex || 0) - (b.dropIndex || 0)));
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [loggedSets]);

  // Get hint for next set (use last standard set weight or previous session)
  const hintWeight = useMemo(() => {
    if (standardSets.length > 0) {
      return standardSets[standardSets.length - 1].weight;
    }
    return previousHint?.lastWeight || 0;
  }, [standardSets, previousHint]);

  // Parse target reps (handle "8-10" format)
  const hintReps = useMemo(() => {
    const match = exercise.targetReps.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 10;
  }, [exercise.targetReps]);

  const handleLogDropSet = (data: Parameters<typeof onLogSet>[0]) => {
    onLogSet(data);
    // After logging a drop, stay in drop mode for more drops
    if (dropSetMode) {
      setDropSetMode({
        setNumber: dropSetMode.setNumber,
        nextDropIndex: dropSetMode.nextDropIndex + 1,
        lastWeight: data.weight,
      });
    }
  };

  const handleStartDropSet = (setNumber: number, lastWeight: number, existingDrops: number) => {
    setDropSetMode({
      setNumber,
      nextDropIndex: existingDrops + 1,
      lastWeight,
    });
  };

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

  const renderSetRow = (set: Set, isDropSet: boolean) => {
    const isEditing = editingSet?.id === set.id;
    const bgClass = isDropSet
      ? 'bg-orange-50 dark:bg-orange-900/20'
      : 'bg-green-50 dark:bg-green-900/20';
    const textClass = isDropSet
      ? 'text-orange-800 dark:text-orange-300'
      : 'text-green-800 dark:text-green-300';
    const valueClass = isDropSet
      ? 'text-orange-800 dark:text-orange-200'
      : 'text-green-900 dark:text-green-200';

    if (isEditing) {
      return (
        <div className={`flex items-center gap-2 py-2 px-3 ${bgClass} rounded-lg ${isDropSet ? 'ml-4 mt-1' : ''}`}>
          <span className={`text-sm font-medium ${textClass} w-12`}>
            {isDropSet ? `↳ Drop ${set.dropIndex}` : `Set ${set.setNumber}`}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={editingSet.weight}
            onChange={(e) => setEditingSet(prev => prev ? { ...prev, weight: e.target.value } : null)}
            className="w-16 text-center text-sm font-semibold border rounded py-1
                       dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            autoFocus
          />
          <span className="text-sm">lbs x</span>
          <input
            type="text"
            inputMode="numeric"
            value={editingSet.reps}
            onChange={(e) => setEditingSet(prev => prev ? { ...prev, reps: e.target.value } : null)}
            className="w-12 text-center text-sm font-semibold border rounded py-1
                       dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <Button variant="primary" size="sm" onClick={handleSaveEdit} className="ml-auto">
            Save
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditingSet(null)}>
            Cancel
          </Button>
        </div>
      );
    }

    return (
      <SwipeableRow
        onSwipeLeft={() => onDeleteSet(set.id)}
        disabled={set.id < 0}
      >
        <div
          className={`flex items-center justify-between py-2 px-3 ${bgClass} rounded-lg
                      ${isDropSet ? 'ml-4 mt-1' : ''} ${onUpdateSet ? 'cursor-pointer active:opacity-80' : ''}`}
          onClick={() => handleSetTap(set)}
        >
          <span className={`text-sm font-medium ${textClass}`}>
            {isDropSet ? `↳ Drop ${set.dropIndex}` : `Set ${set.setNumber}`}
          </span>
          <span className={`font-semibold ${valueClass} ${isDropSet ? 'text-sm' : ''}`}>
            {set.weight} lbs x {set.reps}
            {set.perceivedEffort && (
              <span className={`ml-2 text-sm ${isDropSet ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                RPE {set.perceivedEffort}
              </span>
            )}
          </span>
        </div>
      </SwipeableRow>
    );
  };

  return (
    <div className={`card transition-all ${isComplete ? 'ring-2 ring-green-500 dark:ring-green-400' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg truncate">{exercise.name}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {exercise.targetSets} sets x {exercise.targetReps} reps
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

      {/* Previous Session Hint */}
      {previousHint && loggedSets.length === 0 && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg
                       text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Last time: <strong>{previousHint.lastWeight} lbs</strong> x <strong>{previousHint.lastReps}</strong> reps
          </span>
        </div>
      )}

      {/* Logged Sets (grouped by setNumber) */}
      {setGroups.length > 0 && (
        <div className="mb-4 space-y-1">
          {setGroups.map(([setNumber, sets]) => {
            const standardSet = sets.find(s => (s.dropIndex || 0) === 0);
            const dropSets = sets.filter(s => (s.dropIndex || 0) > 0);
            const lastSet = sets[sets.length - 1];
            const isInDropMode = dropSetMode?.setNumber === setNumber;

            return (
              <div key={setNumber}>
                {/* Standard set row */}
                {standardSet && renderSetRow(standardSet, false)}

                {/* Drop sets (indented) */}
                {dropSets.map((dropSet) => (
                  <div key={dropSet.id}>
                    {renderSetRow(dropSet, true)}
                  </div>
                ))}

                {/* Drop Set input (if in drop mode for this set) */}
                {isInDropMode && dropSetMode && (
                  <div className="ml-4 mt-2">
                    <SetInput
                      exerciseId={exercise.id}
                      exerciseName={exercise.name}
                      setNumber={dropSetMode.setNumber}
                      previousWeight={Math.max(0, dropSetMode.lastWeight - 20)}
                      previousReps={hintReps}
                      onLogSet={handleLogDropSet}
                      isLogging={isLogging}
                      dropIndex={dropSetMode.nextDropIndex}
                      isDropSet
                    />
                    <button
                      onClick={() => setDropSetMode(null)}
                      className="mt-2 text-sm text-gray-500 dark:text-gray-400 hover:underline"
                    >
                      Cancel drop set
                    </button>
                  </div>
                )}

                {/* Add Drop Set button (if not already in drop mode) */}
                {!isInDropMode && lastSet && (
                  <button
                    onClick={() => handleStartDropSet(
                      setNumber,
                      lastSet.weight,
                      dropSets.length
                    )}
                    className="ml-4 mt-1 text-xs text-orange-600 dark:text-orange-400 hover:underline"
                  >
                    + Add Drop Set
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Set Input (if not complete) */}
      {!isComplete && (
        <SetInput
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          setNumber={nextSetNumber}
          previousWeight={hintWeight}
          previousReps={hintReps}
          onLogSet={(data) => {
            onLogSet(data);
            // Exit drop set mode when logging a new standard set
            setDropSetMode(null);
          }}
          isLogging={isLogging}
        />
      )}
    </div>
  );
}
