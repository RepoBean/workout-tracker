import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { Program, Session, ActiveSession, HealthCheckResponse, PreviousSessionResponse, StatsResponse, PreviousSetData } from './types';

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
  calendarSessions: (year: number, month: number) => ['calendarSessions', year, month] as const,
  stats: ['stats'] as const,
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
 * Fetch sessions for a calendar month (for rendering workout dots)
 */
export function useCalendarSessions(year: number, month: number) {
  return useQuery({
    queryKey: queryKeys.calendarSessions(year, month),
    queryFn: async () => {
      const from = `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00.000Z`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;
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
  });
}

/**
 * Fetch workout statistics
 * Passes timezone offset so streak calculation uses user's local date
 */
export function useStats() {
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: async () => {
      const tzOffset = new Date().getTimezoneOffset();
      const { data } = await api.get<StatsResponse>('/sessions/stats', {
        params: { tzOffset },
      });
      return data;
    },
    staleTime: 5 * 60 * 1000, // Stats don't change frequently
  });
}
