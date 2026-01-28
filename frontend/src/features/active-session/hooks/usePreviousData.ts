import { useMemo } from 'react';
import { usePreviousSession } from '../../../shared/api/queries';

export interface PreviousSetData {
  setNumber: number;
  weight: number;
  reps: number;
}

export interface PreviousExerciseHint {
  lastWeight: number;
  lastReps: number;
  sets: PreviousSetData[];
}

export function usePreviousData(sessionId: number) {
  const { data, isLoading } = usePreviousSession(sessionId);

  const exerciseHints = useMemo(() => {
    if (!data?.exerciseData) return new Map<number, PreviousExerciseHint>();

    const hints = new Map<number, PreviousExerciseHint>();

    for (const [exerciseIdStr, exerciseData] of Object.entries(data.exerciseData)) {
      const exerciseId = Number(exerciseIdStr);
      const sets = exerciseData.sets || [];

      // Compute lastWeight/lastReps from the last set in the array
      const lastSet = sets.length > 0 ? sets[sets.length - 1] : null;

      hints.set(exerciseId, {
        lastWeight: lastSet?.weight || 0,
        lastReps: lastSet?.reps || 0,
        sets,
      });
    }

    return hints;
  }, [data]);

  return {
    exerciseHints,
    isLoading,
    hasPreviousSession: !!data?.previousSessionId,
  };
}
