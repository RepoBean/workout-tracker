import { useMemo, useState } from 'react';
import { SetInput } from './SetInput';
import { SwipeableRow } from '../../../shared/ui/SwipeableRow';
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
  isLogging: boolean;
}

interface DropSetMode {
  setNumber: number;
  nextDropIndex: number;
  lastWeight: number;
}

export function ExerciseCard({
  exercise,
  loggedSets,
  previousHint,
  onLogSet,
  onDeleteSet,
  isLogging,
}: ExerciseCardProps) {
  const [dropSetMode, setDropSetMode] = useState<DropSetMode | null>(null);

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
                {standardSet && (
                  <SwipeableRow
                    onSwipeLeft={() => onDeleteSet(standardSet.id)}
                    disabled={standardSet.id < 0}
                  >
                    <div className="flex items-center justify-between py-2 px-3 bg-green-50
                                    dark:bg-green-900/20 rounded-lg">
                      <span className="text-sm font-medium text-green-800 dark:text-green-300">
                        Set {standardSet.setNumber}
                      </span>
                      <span className="font-semibold text-green-900 dark:text-green-200">
                        {standardSet.weight} lbs x {standardSet.reps}
                        {standardSet.perceivedEffort && (
                          <span className="ml-2 text-sm text-green-600 dark:text-green-400">
                            RPE {standardSet.perceivedEffort}
                          </span>
                        )}
                      </span>
                    </div>
                  </SwipeableRow>
                )}

                {/* Drop sets (indented) */}
                {dropSets.map((dropSet) => (
                  <SwipeableRow
                    key={dropSet.id}
                    onSwipeLeft={() => onDeleteSet(dropSet.id)}
                    disabled={dropSet.id < 0}
                  >
                    <div className="flex items-center justify-between py-1.5 px-3 ml-4
                                    bg-orange-50 dark:bg-orange-900/20 rounded-lg mt-1">
                      <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                        ↳ Drop {dropSet.dropIndex}
                      </span>
                      <span className="font-semibold text-orange-800 dark:text-orange-200 text-sm">
                        {dropSet.weight} lbs x {dropSet.reps}
                        {dropSet.perceivedEffort && (
                          <span className="ml-2 text-xs text-orange-600 dark:text-orange-400">
                            RPE {dropSet.perceivedEffort}
                          </span>
                        )}
                      </span>
                    </div>
                  </SwipeableRow>
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
