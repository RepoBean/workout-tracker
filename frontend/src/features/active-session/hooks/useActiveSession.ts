import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { api } from '../../../shared/api/client';
import { queryKeys, useSession } from '../../../shared/api/queries';
import type { Set, ActiveSession, LogSetRequest, CompleteSessionRequest } from '../../../shared/api/types';
import { isCardioSet } from '../../../shared/api/predicates';
import { useToast } from '../../../shared/ui/Toast';
import { useTimer } from '../../../shared/context/TimerContext';
import { useHeartRate } from '../../../shared/context/HeartRateContext';
import { downsampleHr } from '../../../shared/utils/heartRate';

interface UpdateSetRequest {
  weight?: number;
  reps?: number;
  perceivedEffort?: number | null;
  durationSec?: number | null;
  distance?: number | null;
}

interface UseActiveSessionOptions {
  onSetLogged?: (exerciseId: number | null, exerciseName: string) => void;
}

export function useActiveSession(sessionId: number, options?: UseActiveSessionOptions) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { startTimer } = useTimer();
  const heartRate = useHeartRate();

  // HR tracking window — session-level uses sessionStartRef; per-set uses lastSetAtRef
  const sessionStartRef = useRef<number>(Date.now());
  const lastSetAtRef = useRef<number>(sessionStartRef.current);

  // Fetch session data
  const { data: session, isLoading, error } = useSession(sessionId);

  // Log Set Mutation with Optimistic Update
  const logSetMutation = useMutation({
    mutationFn: async (setData: LogSetRequest) => {
      const hrStats = heartRate.statsSince(lastSetAtRef.current);
      const payload: LogSetRequest = {
        ...setData,
        heartRateAvg: setData.heartRateAvg ?? hrStats?.avg ?? null,
        heartRateMax: setData.heartRateMax ?? hrStats?.max ?? null,
      };
      const { data } = await api.post<Set>(`/sessions/${sessionId}/sets`, payload);
      lastSetAtRef.current = Date.now();
      return data;
    },
    onMutate: async (newSet) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.session(sessionId) });

      // Snapshot previous value
      const previousSession = queryClient.getQueryData<ActiveSession>(queryKeys.session(sessionId));

      // Optimistically add the new set
      const tempId = -Date.now();
      const hrStats = heartRate.statsSince(lastSetAtRef.current);
      if (previousSession) {
        const optimisticSet: Set = {
          id: tempId,
          sessionId,
          exerciseId: newSet.exerciseId || null,
          exerciseName: newSet.exerciseName,
          weight: newSet.weight,
          reps: newSet.reps,
          setNumber: newSet.setNumber,
          perceivedEffort: newSet.perceivedEffort || null,
          dropIndex: newSet.dropIndex || 0,
          heartRateAvg: newSet.heartRateAvg ?? hrStats?.avg ?? null,
          heartRateMax: newSet.heartRateMax ?? hrStats?.max ?? null,
          durationSec: newSet.durationSec ?? null,
          distance: newSet.distance ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        queryClient.setQueryData<ActiveSession>(queryKeys.session(sessionId), {
          ...previousSession,
          sets: [...(previousSession.sets || []), optimisticSet],
        });
      }

      return { previousSession, tempId };
    },
    onError: (_err, _newSet, context) => {
      // Revert on error
      if (context?.previousSession) {
        queryClient.setQueryData(queryKeys.session(sessionId), context.previousSession);
      }
      toast.error('Failed to log set. Please try again.');
    },
    onSuccess: (savedSet, variables, context) => {
      // Replace the exact optimistic set with the real one from the server
      const currentSession = queryClient.getQueryData<ActiveSession>(queryKeys.session(sessionId));
      if (currentSession) {
        let replaced = false;
        const updatedSets = (currentSession.sets || []).map(s => {
          if (s.id === context?.tempId) {
            replaced = true;
            return savedSet;
          }
          return s;
        });
        if (!replaced) updatedSets.push(savedSet);

        queryClient.setQueryData<ActiveSession>(queryKeys.session(sessionId), {
          ...currentSession,
          sets: updatedSets,
        });
      }

      // Auto-start rest timer (90s default) — skip for cardio sets
      if (!isCardioSet(variables)) {
        startTimer(90);
      }

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
      const hrStats = heartRate.statsSince(sessionStartRef.current);
      const samples = heartRate.samplesSince(sessionStartRef.current);
      const series = downsampleHr(samples, sessionStartRef.current);
      const body: CompleteSessionRequest = {
        ...(hrStats && {
          heartRateAvg: hrStats.avg,
          heartRateMin: hrStats.min,
          heartRateMax: hrStats.max,
        }),
        ...(series && { heartRateSeries: series }),
      };
      const { data } = await api.post(`/sessions/${sessionId}/complete`, body);
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
