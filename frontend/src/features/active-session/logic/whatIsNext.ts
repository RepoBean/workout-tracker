import type { Program, Workout } from '../../../shared/api/types';

export interface NextWorkoutInfo {
  programId: number;
  programName: string;
  workoutId: number;
  workoutName: string;
  workoutIndex: number;
  totalWorkouts: number;
}

/**
 * Calculate the next workout based on program's currentWorkoutIndex.
 * This is pure client-side logic - no API call needed.
 */
export function calculateNextWorkout(program: Program): NextWorkoutInfo | null {
  if (!program.workouts || program.workouts.length === 0) {
    return null;
  }

  // Sort workouts by orderIndex
  const sortedWorkouts = [...program.workouts].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );

  const index = program.currentWorkoutIndex % sortedWorkouts.length;
  const workout = sortedWorkouts[index];

  return {
    programId: program.id,
    programName: program.name,
    workoutId: workout.id,
    workoutName: workout.name,
    workoutIndex: index,
    totalWorkouts: sortedWorkouts.length,
  };
}

/**
 * Get workout by index (for preview/selection).
 */
export function getWorkoutByIndex(
  program: Program,
  index: number
): Workout | null {
  if (!program.workouts || program.workouts.length === 0) {
    return null;
  }

  const sortedWorkouts = [...program.workouts].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );

  const normalizedIndex = ((index % sortedWorkouts.length) + sortedWorkouts.length) % sortedWorkouts.length;
  return sortedWorkouts[normalizedIndex];
}
