import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { Program, Session, NextWorkoutResponse, HealthCheckResponse, PreviousSessionResponse } from './types';

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
  previousSession: (sessionId: number) => ['previousSession', sessionId] as const,
  nextWorkout: ['nextWorkout'] as const,
  history: (params?: { limit?: number; offset?: number }) => ['history', params] as const,
  exerciseSuggestions: (query: string) => ['exerciseSuggestions', query] as const,
  calendarSessions: (year: number, month: number) => ['calendarSessions', year, month] as const,
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
 * Fetch the next workout for the active program
 */
export function useNextWorkout() {
  return useQuery({
    queryKey: queryKeys.nextWorkout,
    queryFn: async () => {
      const { data } = await api.get<NextWorkoutResponse>('/sessions/next-workout');
      return data;
    },
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
  });
}
