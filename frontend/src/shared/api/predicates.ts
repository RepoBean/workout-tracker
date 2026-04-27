import type { Exercise } from './types';

type CardioSetShape = {
  durationSec?: number | null;
  distance?: number | null;
};

type CardioExerciseShape = {
  exerciseType?: Exercise['exerciseType'];
};

export const isCardioSet = (s: CardioSetShape): boolean =>
  (s.durationSec ?? 0) > 0 || (s.distance ?? 0) > 0;

// Treat as cardio if declared OR if any provided set looks like cardio.
// The fallback covers ad-hoc exercises reconstructed from logged sets.
export const isCardioExercise = (
  e: CardioExerciseShape,
  sets?: CardioSetShape[],
): boolean => e.exerciseType === 'cardio' || (sets?.some(isCardioSet) ?? false);

// Cardio exercises always target 1 effort; strength uses targetSets.
export const getTargetSets = (e: Exercise): number =>
  e.exerciseType === 'cardio' ? 1 : e.targetSets;
