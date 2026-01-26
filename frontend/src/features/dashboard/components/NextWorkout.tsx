import { Button } from '../../../shared/ui/Button';
import { useNextWorkout } from '../../../shared/api/queries';
import { useStartSession } from '../../active-session/hooks/useStartSession';

export function NextWorkout() {
  const { data: nextWorkout, isLoading, error } = useNextWorkout();
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
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4" />
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-full" />
      </div>
    );
  }

  if (error || !nextWorkout) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">Next Workout</h2>
        <p className="text-gray-500 dark:text-gray-400">
          No active program found. Create a program to get started.
        </p>
      </div>
    );
  }

  const exerciseCount = nextWorkout.workout.exercises?.length || 0;

  return (
    <div className="card">
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
        Next Workout
      </h2>
      <div className="mb-4">
        <p className="text-2xl font-bold">{nextWorkout.workout.name}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {nextWorkout.program.name}
        </p>
        {exerciseCount > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Exercise preview */}
      {nextWorkout.workout.exercises && nextWorkout.workout.exercises.length > 0 && (
        <div className="mb-4 space-y-1">
          {nextWorkout.workout.exercises.slice(0, 3).map((exercise) => (
            <div key={exercise.id} className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-primary-500 rounded-full shrink-0" />
              <span className="truncate">{exercise.name}</span>
              <span className="text-gray-400 dark:text-gray-500 shrink-0">
                {exercise.targetSets}x{exercise.targetReps}
              </span>
            </div>
          ))}
          {nextWorkout.workout.exercises.length > 3 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 pl-3.5">
              +{nextWorkout.workout.exercises.length - 3} more
            </p>
          )}
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        onClick={handleStart}
        disabled={startSession.isPending}
        className="w-full"
      >
        {startSession.isPending ? 'Starting...' : 'Start Workout'}
      </Button>
    </div>
  );
}
