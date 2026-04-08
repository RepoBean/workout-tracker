import { useNextWorkoutLocal } from '../hooks/useNextWorkoutLocal';
import { useStartSession } from '../../active-session/hooks/useStartSession';

export function NextWorkout() {
  const { data: nextWorkout, isLoading, error } = useNextWorkoutLocal();
  const startSession = useStartSession();

  const handleStart = () => {
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

  const exerciseCount = nextWorkout.workout.exercises?.length || 0;

  return (
    <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-primary-600 to-primary-700 dark:from-primary-800 dark:to-primary-900 p-5 text-white shadow-lg">
      {/* Subtle decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.05] rounded-full -translate-y-1/2 translate-x-1/2" />

      <p className="text-sm font-medium text-primary-200 mb-1">
        Up Next
      </p>
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

      {/* Exercise preview */}
      {nextWorkout.workout.exercises && nextWorkout.workout.exercises.length > 0 && (
        <div className="mb-4 space-y-1">
          {nextWorkout.workout.exercises.slice(0, 3).map((exercise) => (
            <div key={exercise.id} className="text-sm text-primary-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-primary-300 rounded-full shrink-0" />
              <span className="truncate">{exercise.name}</span>
              <span className="text-primary-300 shrink-0">
                {exercise.targetSets}x{exercise.targetReps}
              </span>
            </div>
          ))}
          {nextWorkout.workout.exercises.length > 3 && (
            <p className="text-xs text-primary-300 pl-3.5">
              +{nextWorkout.workout.exercises.length - 3} more
            </p>
          )}
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
