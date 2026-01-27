import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useHistory as useHistoryQuery } from '../../../shared/api/queries';
import { api } from '../../../shared/api/client';
import { useToast } from '../../../shared/ui/Toast';

const PAGE_SIZE = 10;

export function useSessionHistory() {
  const [offset, setOffset] = useState(0);

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
  const toast = useToast();

  return useMutation({
    mutationFn: async (sessionId: number) => {
      await api.delete(`/sessions/${sessionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['calendarSessions'] });
      toast.success('Session deleted');
    },
    onError: () => {
      toast.error('Failed to delete session');
    },
  });
}
