import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useHistory as useHistoryQuery, useInvalidateHistoryReaders } from '../../../shared/api/queries';
import { api } from '../../../shared/api/client';
import { useToast } from '../../../shared/ui/Toast';
import { clearSessionLocalState } from '../../active-session/lib/sessionStorage';

const PAGE_SIZE = 10;

export function useSessionHistory(highlightSessionId?: number) {
  const [offset, setOffset] = useState(() =>
    // When highlighting a session from calendar, load more initially to find it
    highlightSessionId ? 40 : 0
  );

  const limit = offset + PAGE_SIZE;
  // Fetch one extra to detect if there are more
  const query = useHistoryQuery(limit + 1, 0);

  const sessions = useMemo(() => {
    return (query.data || []).slice(0, limit);
  }, [query.data, limit]);

  const hasMore = (query.data?.length || 0) > limit;

  const loadMore = () => {
    setOffset(prev => prev + PAGE_SIZE);
  };

  return {
    sessions,
    isLoading: query.isLoading,
    error: query.error,
    hasMore,
    loadMore,
    isLoadingMore: query.isFetching && sessions.length > 0,
  };
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateHistoryReaders();
  const toast = useToast();

  return useMutation({
    mutationFn: async (sessionId: number) => {
      await api.delete(`/sessions/${sessionId}`);
      return sessionId;
    },
    onSuccess: (sessionId) => {
      // Drop any per-session localStorage so deleted sessions don't leak
      // state into storage forever.
      clearSessionLocalState(sessionId);
      // Hints and PR baselines included: a deleted session's sets must stop counting.
      queryClient.removeQueries({ queryKey: queryKeys.session(sessionId) });
      invalidate();
      toast.success('Session deleted');
    },
    onError: () => {
      toast.error('Failed to delete session');
    },
  });
}
