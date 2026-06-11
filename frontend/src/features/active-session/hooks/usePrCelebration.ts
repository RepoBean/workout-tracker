import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../../../shared/api/client';
import { queryKeys, type ExerciseAllSet } from '../../../shared/api/queries';
import type { Set } from '../../../shared/api/types';
import { isCardioSet } from '../../../shared/api/predicates';
import { useToast } from '../../../shared/ui/Toast';
import { computeBestOneRepMax, epleyOneRepMax } from '../logic/personalRecord';

/**
 * Session-scoped PR detection. Tracks the running best estimated 1RM per
 * exercise (lowercased name): lazily seeded on first set log per exercise
 * from history, then bumped each time a PR-breaking set is logged so
 * subsequent working sets in the same session don't re-fire.
 */
export function usePrCelebration(sessionId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const sessionPRsRef = useRef<Map<string, number>>(new Map());

  // Fresh baselines if the hook instance survives a session change.
  useEffect(() => {
    sessionPRsRef.current = new Map();
  }, [sessionId]);

  // PR check: lazy-loads historical sets the first time we see an exercise in
  // this session, seeds the running ref with the pre-session best 1RM, and
  // fires a toast when a logged set beats it. The ref bumps on each PR so
  // subsequent sets compare against the running max, not the original
  // baseline.
  async function checkAndCelebratePR(savedSet: Set): Promise<void> {
    if (savedSet.dropIndex > 0) return;
    if (isCardioSet(savedSet)) return;
    if (savedSet.weight <= 0 || savedSet.reps <= 0) return;

    const key = savedSet.exerciseName.toLowerCase();
    let runningBest = sessionPRsRef.current.get(key);

    if (runningBest === undefined) {
      try {
        const data = await queryClient.fetchQuery({
          queryKey: queryKeys.exerciseAllSets(savedSet.exerciseName),
          queryFn: async () => {
            const { data } = await api.get<{ sets: ExerciseAllSet[] }>(
              '/exercises/all-sets-by-name',
              { params: { name: savedSet.exerciseName } }
            );
            return data;
          },
          staleTime: 5 * 60 * 1000,
        });
        const preSessionBest = computeBestOneRepMax(data.sets);
        // Skip first-ever exercise — silent baseline establishment.
        if (preSessionBest <= 0) return;
        sessionPRsRef.current.set(key, preSessionBest);
        runningBest = preSessionBest;
      } catch (err) {
        console.error('Failed to fetch PR history for', savedSet.exerciseName, err);
        return;
      }
    }

    const new1RM = epleyOneRepMax(savedSet.weight, savedSet.reps);
    if (new1RM > runningBest) {
      toast.success(
        `🎉 New PR! ${savedSet.exerciseName}: ${savedSet.weight}×${savedSet.reps} (est 1RM ${new1RM})`
      );
      sessionPRsRef.current.set(key, new1RM);
    }
  }

  return { checkAndCelebratePR };
}
