import { useState } from 'react';
import { useNextWorkoutLocal } from '../hooks/useNextWorkoutLocal';
import { useStartSession } from '../../active-session/hooks/useStartSession';
import { useExerciseHistoryByName } from '../../../shared/api/queries';
import type { Exercise } from '../../../shared/api/types';

function NextWorkoutExerciseRow({ exercise }: { exercise: Exercise }) {
  const { data, isLoading } = useExerciseHistoryByName(exercise.name);
  const prevSets = data?.sets ?? [];

  return (
    <div className="text-sm text-primary-100">
      <div className="flex items-center gap-2">
        {exercise.supersetGroup && (
          <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-primary-400/30 text-primary-50 rounded">
            {exercise.supersetGroup}
          </span>
        )}
        <span className="flex-1 truncate font-medium">{exercise.name}</span>
        <span className="text-primary-300 shrink-0 tabular-nums">
          {exercise.targetSets}×{exercise.targetReps}
        </span>
      </div>
      <div className="pl-1 mt-0.5 text-xs text-primary-200/80 tabular-nums">
        {isLoading ? (
          <span className="text-primary-300/60">…</span>
        ) : prevSets.length === 0 ? (
          <span className="text-primary-300/60">— no history</span>
        ) : (
          prevSets
            .map((s) => {
              const rpe = s.perceivedEffort ? ` @${s.perceivedEffort}` : '';
              return `${s.weight}×${s.reps}${rpe}`;
            })
            .join(' · ')
        )}
      </div>
    </div>
  );
}

export function NextWorkout() {
  const { data: nextWorkout, isLoading, error } = useNextWorkoutLocal();
  const startSession = useStartSession();
  const [expanded, setExpanded] = useState(false);

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nextWorkout?.workout) {
      startSession.mutate({
        workoutId: nextWorkout.workout.id,
        isAdHoc: false,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-5 bg-gray-200 dark:bg-surface-800 rounded w-1/3 mb-4" />
        <div className="h-8 bg-gray-200 dark:bg-surface-800 rounded w-2/3 mb-2" />
        <div className="h-4 bg-gray-200 dark:bg-surface-800 rounded w-1/2 mb-4" />
        <div className="h-12 bg-gray-200 dark:bg-surface-800 rounded w-full" />
      </div>
    );
  }

  if (error || !nextWorkout) {
    return (
      <div className="card">
        <h2 className="text-lg font-display font-bold mb-2">Next Workout</h2>
        <p className="text-gray-500 dark:text-gray-400">
          No active program found. Create a program to get started.
        </p>
      </div>
    );
  }

  const exercises = nextWorkout.workout.exercises ?? [];
  const exerciseCount = exercises.length;
  const hasExercises = exerciseCount > 0;

  return (
    <div
      className="relative overflow-hidden rounded-card bg-gradient-to-br from-primary-600 to-primary-700 dark:from-primary-800 dark:to-primary-900 p-5 text-white shadow-lg cursor-pointer select-none"
      onClick={() => hasExercises && setExpanded((v) => !v)}
      role={hasExercises ? 'button' : undefined}
      aria-expanded={hasExercises ? expanded : undefined}
    >
      {/* Subtle decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.05] rounded-full -translate-y-1/2 translate-x-1/2" />

      <div className="flex items-center gap-1 mb-1">
        <p className="text-sm font-medium text-primary-200">Up Next</p>
        {hasExercises && (
          <span className="text-primary-200 text-sm leading-none" aria-hidden>
            {expanded ? '▴' : '▾'}
          </span>
        )}
      </div>
      <div className="mb-4">
        <p className="text-2xl font-display font-bold">{nextWorkout.workout.name}</p>
        <p className="text-sm text-primary-200">
          {nextWorkout.program.name}
        </p>
        {exerciseCount > 0 && (
          <p className="text-sm text-primary-200 mt-0.5">
            {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Exercise list — compact preview or full expanded view */}
      {hasExercises && !expanded && (
        <div className="mb-4 space-y-1">
          {exercises.slice(0, 3).map((exercise) => (
            <div key={exercise.id} className="text-sm text-primary-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-primary-300 rounded-full shrink-0" />
              <span className="truncate">{exercise.name}</span>
              <span className="text-primary-300 shrink-0">
                {exercise.targetSets}x{exercise.targetReps}
              </span>
            </div>
          ))}
          {exercises.length > 3 && (
            <p className="text-xs text-primary-300 pl-3.5">
              +{exercises.length - 3} more
            </p>
          )}
        </div>
      )}

      {hasExercises && expanded && (
        <div className="mb-4 space-y-3">
          {exercises.map((exercise) => (
            <NextWorkoutExerciseRow key={exercise.id} exercise={exercise} />
          ))}
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={startSession.isPending}
        className="w-full py-3.5 min-h-[48px] bg-white text-primary-700 font-display font-bold text-lg rounded-lg transition-all duration-150 active:scale-[0.97] hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      >
        {startSession.isPending ? 'Starting...' : 'Start Workout'}
      </button>
    </div>
  );
}
