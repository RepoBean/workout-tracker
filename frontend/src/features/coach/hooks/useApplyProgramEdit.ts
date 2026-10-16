import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../shared/api/client';
import { queryKeys } from '../../../shared/api/queries';
import type { Exercise, Workout } from '../../../shared/api/types';
import { useToast } from '../../../shared/ui/Toast';
import { stepCount, type ProgramEditPlan } from '../lib/programEdit';

class PartialApplyError extends Error {
  constructor(readonly done: number, readonly total: number) {
    super(`Applied ${done} of ${total} changes`);
  }
}

/**
 * Apply a coach-proposed program edit through the ordinary program-builder endpoints — the
 * user's tap, never the model's. Per workout: create (new) → deletes → full PUTs → creates →
 * reorder. Not transactional: a failure stops there and says how far it got; the programs
 * query is refetched either way so the builder shows the truth.
 */
export function useApplyProgramEdit() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (plan: ProgramEditPlan) => {
      const total = stepCount(plan);
      let done = 0;
      const step = async <T,>(p: Promise<T>): Promise<T> => {
        const r = await p;
        done += 1;
        return r;
      };
      try {
        let nextWorkoutIndex = await api
          .get<{ workouts?: Workout[] }>(`/programs/${plan.programId}`)
          .then((r) => r.data.workouts?.length ?? 0);
        for (const w of plan.workouts) {
          const workoutId = w.workout
            ? w.workout.id
            : (await step(api.post<Workout>('/workouts', {
                programId: plan.programId, name: w.name, orderIndex: nextWorkoutIndex++,
              }))).data.id;

          for (const e of w.removes) await step(api.delete(`/exercises/${e.id}`));

          for (const u of w.updates) {
            const e = u.exercise;
            // Full exercise, never just the changed fields (an older backend 400s a body
            // that strips down to nothing).
            await step(api.put(`/exercises/${e.id}`, {
              name: e.name,
              targetSets: u.next.targetSets,
              targetReps: u.next.targetReps,
              supersetGroup: u.next.supersetGroup,
              exerciseType: e.exerciseType,
              cardioModality: e.cardioModality,
              targetDurationSec: e.targetDurationSec,
              targetDistance: e.targetDistance,
              incrementLbs: u.next.incrementLbs,
            }));
          }

          // After the highest kept slot, not the count: removals leave gaps in orderIndex.
          const removed = new Set(w.removes.map((e) => e.id));
          const kept = (w.workout?.exercises ?? []).filter((e) => !removed.has(e.id));
          const base = Math.max(-1, ...kept.map((e) => e.orderIndex)) + 1;
          const addedIds: number[] = [];
          for (const [i, a] of w.adds.entries()) {
            const { data } = await step(api.post<Exercise>('/exercises', {
              workoutId,
              name: a.name,
              targetSets: a.targetSets,
              targetReps: a.targetReps,
              orderIndex: base + i,
              supersetGroup: a.supersetGroup ?? null,
              exerciseType: 'strength',
              incrementLbs: a.incrementLbs ?? null,
            }));
            addedIds.push(data.id);
          }

          if (w.reordered) {
            const exerciseIds = w.order.map((o) => ('id' in o ? o.id : addedIds[o.add]));
            await step(api.post(`/workouts/${workoutId}/reorder-exercises`, { exerciseIds }));
          }
        }
      } catch {
        throw new PartialApplyError(done, total);
      }
      return total;
    },
    onSuccess: () => toast.success('Program updated'),
    onError: (err) => {
      toast.error(err instanceof PartialApplyError ? `${err.message} — check the program` : 'Failed to update program');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.programs }),
  });
}
