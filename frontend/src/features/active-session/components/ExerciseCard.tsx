import { useMemo } from 'react';
import { SetInput } from './SetInput';
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
  }) => void;
  isLogging: boolean;
}

export function ExerciseCard({
  exercise,
  loggedSets,
  previousHint,
  onLogSet,
  isLogging,
}: ExerciseCardProps) {
  const nextSetNumber = loggedSets.length + 1;
  const isComplete = loggedSets.length >= exercise.targetSets;

  // Get hint for next set (use previous session or last logged set)
  const hintWeight = useMemo(() => {
    if (loggedSets.length > 0) {
      return loggedSets[loggedSets.length - 1].weight;
    }
    return previousHint?.lastWeight || 0;
  }, [loggedSets, previousHint]);

  // Parse target reps (handle "8-10" format)
  const hintReps = useMemo(() => {
    const match = exercise.targetReps.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 10;
  }, [exercise.targetReps]);

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

      {/* Logged Sets */}
      {loggedSets.length > 0 && (
        <div className="mb-4 space-y-2">
          {loggedSets.map((set) => (
            <div
              key={set.id}
              className="flex items-center justify-between py-2 px-3 bg-green-50
                         dark:bg-green-900/20 rounded-lg"
            >
              <span className="text-sm font-medium text-green-800 dark:text-green-300">
                Set {set.setNumber}
              </span>
              <span className="font-semibold text-green-900 dark:text-green-200">
                {set.weight} lbs x {set.reps}
                {set.perceivedEffort && (
                  <span className="ml-2 text-sm text-green-600 dark:text-green-400">
                    RPE {set.perceivedEffort}
                  </span>
                )}
              </span>
            </div>
          ))}
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
          onLogSet={onLogSet}
          isLogging={isLogging}
        />
      )}
    </div>
  );
}
