import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useNextWorkoutLocal } from '../hooks/useNextWorkoutLocal';
import { useStartSession } from '../../active-session/hooks/useStartSession';
import { useExerciseHistoryByName } from '../../../shared/api/queries';
import { exerciseTargetSummary } from '../../../shared/api/cardio';
import type { Exercise } from '../../../shared/api/types';

function NextWorkoutExerciseRow({ exercise }: { exercise: Exercise }) {
  const isCardio = exercise.exerciseType === 'cardio';
  // Cardio history sets only carry weight/reps here (always 0×0) — skip the fetch.
  const { data, isLoading } = useExerciseHistoryByName(isCardio ? '' : exercise.name);
  const prevSets = data?.sets ?? [];

  return (
    <div className="text-sm text-primary-50">
      <div className="flex items-center gap-2">
        {exercise.supersetGroup && (
          <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-primary-400/30 text-primary-50 rounded">
            {exercise.supersetGroup}
          </span>
        )}
        <span className="flex-1 truncate font-medium">{exercise.name}</span>
        <span className="text-primary-200 shrink-0 tabular-nums">
          {exerciseTargetSummary(exercise)}
        </span>
      </div>
      {!isCardio && (
        <div className="pl-1 mt-0.5 text-xs text-primary-200/80 tabular-nums">
          {isLoading ? (
            <span className="text-primary-300/60">…</span>
          ) : prevSets.length === 0 ? (
            <span className="text-primary-300/60">no history yet</span>
          ) : (
            <>
              <span className="text-primary-300/70">last </span>
              {prevSets
                .map((s) => {
                  const rpe = s.perceivedEffort ? ` @${s.perceivedEffort}` : '';
                  return `${s.weight}×${s.reps}${rpe}`;
                })
                .join(' · ')}
            </>
          )}
        </div>
      )}
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
    // Skeleton mirrors the hero's real surface so nothing flashes white → teal.
    return (
      <div className="rounded-card bg-gradient-to-br from-primary-600 to-primary-700 dark:from-primary-800 dark:to-primary-950 p-5 animate-pulse">
        <div className="h-3 bg-white/20 rounded w-16 mb-3" />
        <div className="h-8 bg-white/25 rounded w-2/3 mb-2" />
        <div className="h-4 bg-white/15 rounded w-1/2 mb-6" />
        <div className="h-[52px] bg-white/70 rounded-xl w-full" />
      </div>
    );
  }

  if (error || !nextWorkout) {
    return (
      <div className="card">
        <p className="eyebrow text-gray-400 dark:text-gray-500 mb-2">Up next</p>
        <p className="text-lg font-display font-bold mb-1">No active program</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Set one up and your next workout will be waiting here.
        </p>
        <Link
          to="/programs"
          className="block w-full min-h-[48px] px-6 py-3 bg-gradient-to-b from-primary-500 to-primary-600 text-white text-center font-medium text-lg rounded-lg shadow-sm active:scale-[0.97] transition-all duration-150"
        >
          Set Up a Program
        </Link>
      </div>
    );
  }

  const exercises = nextWorkout.workout.exercises ?? [];
  const exerciseCount = exercises.length;
  const hasExercises = exerciseCount > 0;

  const workouts = nextWorkout.program.workouts ?? [];
  const position = workouts.findIndex((w) => w.id === nextWorkout.workout.id);
  const rotationLabel =
    workouts.length > 1 && position >= 0 ? `Workout ${position + 1} of ${workouts.length}` : null;

  return (
    <div
      className="rounded-card bg-gradient-to-br from-primary-600 to-primary-700 dark:from-primary-800 dark:to-primary-950 p-5 text-white shadow-lg cursor-pointer select-none"
      onClick={() => hasExercises && setExpanded((v) => !v)}
      role={hasExercises ? 'button' : undefined}
      aria-expanded={hasExercises ? expanded : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="eyebrow text-primary-200">Up next</p>
        {hasExercises && (
          <svg
            className={`w-4 h-4 text-primary-200 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
      <div className="mb-4">
        <p className="text-3xl font-display font-extrabold tracking-tight leading-tight">
          {nextWorkout.workout.name}
        </p>
        <p className="text-sm text-primary-200 mt-1">
          {nextWorkout.program.name}
          {rotationLabel && <> · {rotationLabel}</>}
        </p>
      </div>

      {/* Exercise list — compact preview or full expanded view */}
      {hasExercises && !expanded && (
        <div className="mb-5 space-y-1.5">
          {exercises.slice(0, 3).map((exercise) => (
            <div key={exercise.id} className="text-sm text-primary-50 flex items-center gap-2.5">
              <span className="w-1 h-1 bg-primary-300 rounded-full shrink-0" />
              <span className="truncate">{exercise.name}</span>
              <span className="text-primary-200 shrink-0 tabular-nums">
                {exerciseTargetSummary(exercise)}
              </span>
            </div>
          ))}
          {exercises.length > 3 && (
            <p className="text-xs text-primary-200/80 pl-3.5">+{exercises.length - 3} more</p>
          )}
        </div>
      )}

      {hasExercises && expanded && (
        <div className="mb-5 space-y-3">
          {exercises.map((exercise) => (
            <NextWorkoutExerciseRow key={exercise.id} exercise={exercise} />
          ))}
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={startSession.isPending}
        className="w-full py-3.5 min-h-[52px] bg-white text-primary-700 font-display font-bold text-lg rounded-xl transition-all duration-150 active:scale-[0.97] hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      >
        {startSession.isPending ? 'Starting…' : 'Start Workout'}
      </button>
    </div>
  );
}
