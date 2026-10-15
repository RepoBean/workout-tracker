import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../shared/api/client';
import { queryKeys, useInvalidateHistoryReaders } from '../../../shared/api/queries';
import { useToast } from '../../../shared/ui/Toast';
import type { ActiveSession, LogSetRequest, Set } from '../../../shared/api/types';

export type SetPatch = Partial<Pick<Set, 'weight' | 'reps' | 'perceivedEffort' | 'durationSec' | 'distance'>>;

/**
 * Mutations for editing a completed session (v4 C1). Deliberately none of the
 * live-session machinery: no HR stamping, rest timer, PR toast, RPE flow or
 * auto-advance. Each edit is optimistic on the session query and, once settled,
 * invalidates every history reader (hints, PR baselines, Progress, stats, calendar).
 */
export function useSessionEdits(sessionId: number) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateHistoryReaders();
  const toast = useToast();
  const key = queryKeys.session(sessionId);

  // Optimistic update of the cached session; returns the snapshot to roll back to.
  const patchCache = async (update: (session: ActiveSession) => ActiveSession) => {
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<ActiveSession>(key);
    if (previous) queryClient.setQueryData<ActiveSession>(key, update(previous));
    return { previous };
  };

  const rollback = (message: string) =>
    (_err: unknown, _vars: unknown, context?: { previous?: ActiveSession }) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(message);
    };

  const settle = () => invalidate(sessionId);

  const addSet = useMutation({
    mutationFn: async (body: LogSetRequest) => {
      const { data } = await api.post<Set>(`/sessions/${sessionId}/sets`, body);
      return data;
    },
    onMutate: (body) => patchCache((s) => ({
      ...s,
      sets: [...(s.sets ?? []), {
        id: -Date.now(), sessionId, exerciseId: body.exerciseId ?? null, exerciseName: body.exerciseName,
        weight: body.weight, reps: body.reps, setNumber: body.setNumber,
        perceivedEffort: body.perceivedEffort ?? null, dropIndex: 0, heartRateAvg: null, heartRateMax: null,
        durationSec: body.durationSec ?? null, distance: body.distance ?? null, catalogId: null,
        createdAt: s.completedAt ?? s.createdAt, updatedAt: new Date().toISOString(),
      }],
    })),
    onError: rollback('Failed to add set'),
    onSettled: settle,
  });

  const updateSet = useMutation({
    mutationFn: async ({ setId, patch }: { setId: number; patch: SetPatch }) => {
      const { data } = await api.put<Set>(`/sessions/${sessionId}/sets/${setId}`, patch);
      return data;
    },
    onMutate: ({ setId, patch }) => patchCache((s) => ({
      ...s,
      sets: (s.sets ?? []).map(set => (set.id === setId ? { ...set, ...patch } : set)),
    })),
    onError: rollback('Failed to save set'),
    onSettled: settle,
  });

  const deleteSet = useMutation({
    mutationFn: async (setId: number) => {
      await api.delete(`/sessions/${sessionId}/sets/${setId}`);
    },
    onMutate: (setId) => patchCache((s) => ({
      ...s,
      sets: (s.sets ?? []).filter(set => set.id !== setId),
    })),
    onError: rollback('Failed to delete set'),
    onSettled: settle,
  });

  const setDate = useMutation({
    mutationFn: async (completedAt: string) => {
      const { data } = await api.put<ActiveSession>(`/sessions/${sessionId}`, { completedAt });
      return data;
    },
    onSuccess: (session) => {
      queryClient.setQueryData(key, session);
      toast.success('Date updated');
    },
    onError: () => toast.error('Failed to change the date'),
    onSettled: settle,
  });

  return { addSet, updateSet, deleteSet, setDate };
}
