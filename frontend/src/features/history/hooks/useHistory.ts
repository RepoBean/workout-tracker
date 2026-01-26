import { useState, useMemo } from 'react';
import { useHistory as useHistoryQuery } from '../../../shared/api/queries';

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
