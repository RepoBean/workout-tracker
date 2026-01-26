import { useMemo } from 'react';
import { usePreviousSession } from '../../../shared/api/queries';

export interface PreviousExerciseHint {
  lastWeight: number;
  lastReps: number;
}

export function usePreviousData(sessionId: number) {
  const { data, isLoading } = usePreviousSession(sessionId);

  const exerciseHints = useMemo(() => {
    if (!data?.exerciseData) return new Map<number, PreviousExerciseHint>();

    const hints = new Map<number, PreviousExerciseHint>();

    for (const [exerciseIdStr, exerciseData] of Object.entries(data.exerciseData)) {
      const exerciseId = Number(exerciseIdStr);
      hints.set(exerciseId, {
        lastWeight: exerciseData.lastWeight,
        lastReps: exerciseData.lastReps,
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
