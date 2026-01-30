import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../shared/api/client';
import { queryKeys, useSession } from '../../../shared/api/queries';
import type { Set, ActiveSession, LogSetRequest } from '../../../shared/api/types';
import { useToast } from '../../../shared/ui/Toast';
import { useTimer } from '../../../shared/context/TimerContext';

interface UpdateSetRequest {
  weight?: number;
  reps?: number;
  perceivedEffort?: number | null;
}

interface UseActiveSessionOptions {
  onSetLogged?: (exerciseId: number | null, exerciseName: string) => void;
}

export function useActiveSession(sessionId: number, options?: UseActiveSessionOptions) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { startTimer } = useTimer();

  // Fetch session data
  const { data: session, isLoading, error } = useSession(sessionId);

  // Log Set Mutation with Optimistic Update
  const logSetMutation = useMutation({
    mutationFn: async (setData: LogSetRequest) => {
      const { data } = await api.post<Set>(`/sessions/${sessionId}/sets`, setData);
      return data;
    },
    onMutate: async (newSet) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.session(sessionId) });

      // Snapshot previous value
      const previousSession = queryClient.getQueryData<ActiveSession>(queryKeys.session(sessionId));

      // Optimistically add the new set
      if (previousSession) {
        const optimisticSet: Set = {
          id: -Date.now(), // Temporary negative ID to identify optimistic updates
          sessionId,
          exerciseId: newSet.exerciseId || null,
          exerciseName: newSet.exerciseName,
          weight: newSet.weight,
          reps: newSet.reps,
          setNumber: newSet.setNumber,
          perceivedEffort: newSet.perceivedEffort || null,
          dropIndex: newSet.dropIndex || 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        queryClient.setQueryData<ActiveSession>(queryKeys.session(sessionId), {
          ...previousSession,
          sets: [...(previousSession.sets || []), optimisticSet],
        });
      }

      return { previousSession };
    },
    onError: (_err, _newSet, context) => {
      // Revert on error
      if (context?.previousSession) {
        queryClient.setQueryData(queryKeys.session(sessionId), context.previousSession);
      }
      toast.error('Failed to log set. Please try again.');
    },
    onSuccess: (savedSet, variables) => {
      // Replace optimistic set with real one
      const currentSession = queryClient.getQueryData<ActiveSession>(queryKeys.session(sessionId));
      if (currentSession) {
        // Remove the optimistic set (negative ID) and add the real one
        const updatedSets = currentSession.sets?.filter(s => s.id > 0) || [];
        updatedSets.push(savedSet);

        queryClient.setQueryData<ActiveSession>(queryKeys.session(sessionId), {
          ...currentSession,
          sets: updatedSets,
        });
      }

      // Auto-start rest timer (90s default)
      startTimer(90);

      // Call the callback if provided
      options?.onSetLogged?.(variables.exerciseId ?? null, variables.exerciseName);
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
    },
  });

  // Update Set Mutation with Optimistic Update
  const updateSetMutation = useMutation({
    mutationFn: async ({ setId, updates }: { setId: number; updates: UpdateSetRequest }) => {
      const { data } = await api.put<Set>(`/sessions/${sessionId}/sets/${setId}`, updates);
      return data;
    },
    onMutate: async ({ setId, updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.session(sessionId) });

      const previousSession = queryClient.getQueryData<ActiveSession>(queryKeys.session(sessionId));

      if (previousSession) {
        queryClient.setQueryData<ActiveSession>(queryKeys.session(sessionId), {
          ...previousSession,
          sets: previousSession.sets?.map(s =>
            s.id === setId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
          ) || [],
        });
      }

      return { previousSession };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSession) {
        queryClient.setQueryData(queryKeys.session(sessionId), context.previousSession);
      }
      toast.error('Failed to update set. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
    },
  });

  // Update effort for all sets of an exercise
  const updateSetsEffortMutation = useMutation({
    mutationFn: async ({ exerciseId, effort, exerciseName }: { exerciseId: number; effort: number; exerciseName?: string }) => {
      const currentSession = queryClient.getQueryData<ActiveSession>(queryKeys.session(sessionId));

      // For ad-hoc exercises (negative ID), filter by exerciseName since exerciseId is null in DB
      const setsToUpdate = exerciseId < 0 && exerciseName
        ? currentSession?.sets?.filter(s => s.exerciseId === null && s.exerciseName === exerciseName) || []
        : currentSession?.sets?.filter(s => s.exerciseId === exerciseId) || [];

      // Update each set sequentially
      const results = await Promise.all(
        setsToUpdate.map(set =>
          api.put<Set>(`/sessions/${sessionId}/sets/${set.id}`, { perceivedEffort: effort })
        )
      );

      return results.map(r => r.data);
    },
    onMutate: async ({ exerciseId, effort, exerciseName }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.session(sessionId) });

      const previousSession = queryClient.getQueryData<ActiveSession>(queryKeys.session(sessionId));

      if (previousSession) {
        // For ad-hoc exercises (negative ID), match by exerciseName since exerciseId is null in DB
        const isAdHoc = exerciseId < 0 && exerciseName;
        queryClient.setQueryData<ActiveSession>(queryKeys.session(sessionId), {
          ...previousSession,
          sets: previousSession.sets?.map(s => {
            const matches = isAdHoc
              ? s.exerciseId === null && s.exerciseName === exerciseName
              : s.exerciseId === exerciseId;
            return matches
              ? { ...s, perceivedEffort: effort, updatedAt: new Date().toISOString() }
              : s;
          }) || [],
        });
      }

      return { previousSession };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousSession) {
        queryClient.setQueryData(queryKeys.session(sessionId), context.previousSession);
      }
      toast.error('Failed to save RPE. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
    },
  });

  // Delete Set Mutation with Optimistic Update
  const deleteSetMutation = useMutation({
    mutationFn: async (setId: number) => {
      await api.delete(`/sessions/${sessionId}/sets/${setId}`);
    },
    onMutate: async (setId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.session(sessionId) });

      const previousSession = queryClient.getQueryData<ActiveSession>(queryKeys.session(sessionId));

      if (previousSession) {
        queryClient.setQueryData<ActiveSession>(queryKeys.session(sessionId), {
          ...previousSession,
          sets: previousSession.sets?.filter(s => s.id !== setId) || [],
        });
      }

      return { previousSession };
    },
    onError: (_err, _setId, context) => {
      if (context?.previousSession) {
        queryClient.setQueryData(queryKeys.session(sessionId), context.previousSession);
      }
      toast.error('Failed to delete set. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
    },
  });

  // Complete Session Mutation
  const completeSessionMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/sessions/${sessionId}/complete`);
      return data;
    },
    onSuccess: () => {
      toast.success('Workout completed!');
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.programs }); // Refreshes useNextWorkoutLocal
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSession });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      queryClient.invalidateQueries({ queryKey: ['calendarSessions'] });
    },
    onError: () => {
      toast.error('Failed to complete workout. Please try again.');
    },
  });

  return {
    session: session as ActiveSession | undefined,
    isLoading,
    error,
    logSet: logSetMutation.mutate,
    isLoggingSet: logSetMutation.isPending,
    updateSet: (setId: number, updates: UpdateSetRequest) =>
      updateSetMutation.mutate({ setId, updates }),
    isUpdatingSet: updateSetMutation.isPending,
    updateSetsEffort: (exerciseId: number, effort: number, exerciseName?: string) =>
      updateSetsEffortMutation.mutate({ exerciseId, effort, exerciseName }),
    isUpdatingSetsEffort: updateSetsEffortMutation.isPending,
    deleteSet: deleteSetMutation.mutate,
    isDeletingSet: deleteSetMutation.isPending,
    completeSession: completeSessionMutation.mutate,
    isCompletingSession: completeSessionMutation.isPending,
  };
}
