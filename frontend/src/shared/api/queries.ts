import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Program, Session, ActiveSession, HealthCheckResponse, PreviousSessionResponse, StatsResponse, PreviousSetData, SetExerciseNoteRequest } from './types';
import { useToast } from '../ui/Toast';

// ============================================
// Query Keys
// ============================================

export const queryKeys = {
  health: ['health'] as const,
  programs: ['programs'] as const,
  program: (id: number) => ['programs', id] as const,
  workouts: ['workouts'] as const,
  workout: (id: number) => ['workouts', id] as const,
  sessions: ['sessions'] as const,
  session: (id: number) => ['sessions', id] as const,
  activeSession: ['activeSession'] as const,
  previousSession: (sessionId: number) => ['previousSession', sessionId] as const,
  // nextWorkout removed - frontend calculates locally via useNextWorkoutLocal
  history: (params?: { limit?: number; offset?: number }) => params ? ['history', params] as const : ['history'] as const,
  exerciseSuggestions: (query: string) => ['exerciseSuggestions', query] as const,
  exerciseHistoryByName: (name: string) => ['exerciseHistoryByName', name] as const,
  exerciseAllSets: (name: string) => ['exercises', 'all-sets', name] as const,
  calendarSessions: (year: number, month: number) => ['calendarSessions', year, month] as const,
  stats: ['stats'] as const,
  progressHistory: ['progressHistory'] as const,
};

// ============================================
// Query Hooks
// ============================================

/**
 * Health check query - useful for checking API connectivity
 */
export function useHealthCheck() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: async () => {
      const { data } = await api.get<HealthCheckResponse>('/health');
      return data;
    },
  });
}

/**
 * Fetch all programs (non-archived)
 */
export function usePrograms() {
  return useQuery({
    queryKey: queryKeys.programs,
    queryFn: async () => {
      const { data } = await api.get<Program[]>('/programs');
      return data;
    },
    staleTime: 2 * 60 * 1000, // Programs rarely change mid-session
  });
}

/**
 * Fetch a single program with its workouts and exercises
 */
export function useProgram(id: number) {
  return useQuery({
    queryKey: queryKeys.program(id),
    queryFn: async () => {
      const { data } = await api.get<Program>(`/programs/${id}`);
      return data;
    },
    enabled: !!id,
  });
}


/**
 * Fetch a single session with its sets
 */
export function useSession(id: number) {
  return useQuery({
    queryKey: queryKeys.session(id),
    queryFn: async () => {
      const { data } = await api.get<Session>(`/sessions/${id}`);
      return data;
    },
    enabled: !!id,
    staleTime: 30 * 1000, // 30 seconds - reduces refetches during active workout
  });
}

/**
 * Fetch session history with pagination
 */
export function useHistory(limit = 50, offset = 0) {
  return useQuery({
    queryKey: queryKeys.history({ limit, offset }),
    queryFn: async () => {
      const { data } = await api.get<Session[]>('/sessions/history', {
        params: { limit, offset },
      });
      return data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes — history data doesn't change frequently
  });
}

/**
 * Fetch exercise name suggestions for autocomplete
 */
export function useExerciseSuggestions(query: string) {
  return useQuery({
    queryKey: queryKeys.exerciseSuggestions(query),
    queryFn: async () => {
      const { data } = await api.get<string[]>('/exercises/suggestions', {
        params: { q: query },
      });
      return data;
    },
    enabled: query.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes — suggestions rarely change
  });
}

/**
 * Fetch exercise history by name (for ad-hoc exercises)
 * Returns sets from the most recent completed session with that exercise name
 */
export function useExerciseHistoryByName(name: string) {
  return useQuery({
    queryKey: queryKeys.exerciseHistoryByName(name),
    queryFn: async () => {
      const { data } = await api.get<{ sets: PreviousSetData[]; fromSessionDate: string | null }>(
        '/exercises/history-by-name',
        { params: { name } }
      );
      return data;
    },
    enabled: name.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch all standard sets for an exercise across all completed sessions.
 * Used by the active session PR check. Returns raw set rows so the frontend
 * can compute the best estimated 1-rep max client-side.
 */
export interface ExerciseAllSet {
  weight: number;
  reps: number;
  dropIndex: number;
  durationSec: number | null;
  distance: number | null;
  completedAt: string | null;
}

export function useExerciseAllSetsByName(name: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.exerciseAllSets(name),
    queryFn: async () => {
      const { data } = await api.get<{ sets: ExerciseAllSet[] }>(
        '/exercises/all-sets-by-name',
        { params: { name } }
      );
      return data;
    },
    enabled: enabled && name.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch sessions for a calendar month (for rendering workout dots)
 */
export function useCalendarSessions(year: number, month: number) {
  return useQuery({
    queryKey: queryKeys.calendarSessions(year, month),
    queryFn: async () => {
      // Use local-midnight boundaries so sessions land in the cell they were
      // completed in for the user's timezone. Calendar cells filter by local
      // month/day; the API stores UTC, so the toISOString() conversion lines
      // both sides up.
      const from = new Date(year, month, 1).toISOString();
      const to = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();
      const { data } = await api.get<Session[]>('/sessions/history', {
        params: { from, to, limit: 100 },
      });
      return data;
    },
    staleTime: 5 * 60 * 1000, // Calendar data for past months doesn't change
  });
}

/**
 * Fetch previous session data for hints (weight/reps from last time)
 */
export function usePreviousSession(sessionId: number) {
  return useQuery({
    queryKey: queryKeys.previousSession(sessionId),
    queryFn: async () => {
      const { data } = await api.get<PreviousSessionResponse>(`/sessions/${sessionId}/previous`);
      return data;
    },
    enabled: !!sessionId,
    staleTime: 10 * 60 * 1000, // Previous session data doesn't change during a workout
  });
}

/**
 * Check for an active (incomplete) session to resume
 */
export function useActiveSessionCheck() {
  return useQuery({
    queryKey: queryKeys.activeSession,
    queryFn: async () => {
      const { data } = await api.get<ActiveSession | null>('/sessions/active');
      return data;
    },
    staleTime: 30 * 1000, // 30 seconds — reduce unnecessary refetches on window focus
  });
}

/**
 * Set or clear a per-exercise note on a session.
 * Empty/whitespace `note` (or null) clears the note for that exercise.
 */
export function useSetExerciseNote(sessionId: number) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (vars: SetExerciseNoteRequest) => {
      const { data } = await api.put<Session>(`/sessions/${sessionId}/exercise-note`, vars);
      return data;
    },
    onMutate: async ({ exerciseName, note }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.session(sessionId) });
      const previous = queryClient.getQueryData<ActiveSession>(queryKeys.session(sessionId));

      if (previous) {
        const trimmed = typeof note === 'string' ? note.trim() : null;
        const nextNotes = { ...(previous.exerciseNotes ?? {}) };
        if (trimmed === null || trimmed === '') {
          delete nextNotes[exerciseName];
        } else {
          nextNotes[exerciseName] = trimmed;
        }
        queryClient.setQueryData<ActiveSession>(queryKeys.session(sessionId), {
          ...previous,
          exerciseNotes: Object.keys(nextNotes).length > 0 ? nextNotes : null,
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.session(sessionId), context.previous);
      }
      toast.error('Failed to save note. Please try again.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

/**
 * Fetch workout statistics
 */
export function useStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: async () => {
      const { data } = await api.get<StatsResponse>('/sessions/stats');
      return data;
    },
    staleTime: 5 * 60 * 1000, // Stats don't change frequently
  });
}
