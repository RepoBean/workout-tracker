import { useSearchParams } from 'react-router-dom';
import { Button } from '../../shared/ui/Button';
import { SwipeableRow } from '../../shared/ui/SwipeableRow';
import { useSessionHistory, useDeleteSession } from './hooks/useHistory';
import { SessionCard } from './components/SessionCard';

export default function History() {
  const [searchParams] = useSearchParams();
  const highlightSessionId = searchParams.get('sessionId');
  const { sessions, isLoading, error, hasMore, loadMore, isLoadingMore } = useSessionHistory(
    highlightSessionId ? Number(highlightSessionId) : undefined
  );
  const deleteSession = useDeleteSession();

  const handleExport = () => {
    window.open('/api/sessions/export-csv', '_blank');
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-display font-bold">Workout History</h1>
        {[1, 2, 3].map(i => (
          <div key={i} className="card animate-pulse">
            <div className="h-5 bg-gray-200 dark:bg-surface-700 rounded w-40 mb-2" />
            <div className="h-4 bg-gray-200 dark:bg-surface-700 rounded w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-display font-bold">Workout History</h1>
        <div className="card text-red-600 dark:text-red-400">
          Failed to load history. Make sure the backend is running.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Workout History</h1>
        {sessions.length > 0 && (
          <Button variant="secondary" size="sm" onClick={handleExport}>
            Export CSV
          </Button>
        )}
      </div>

      {sessions.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-gray-500 dark:text-gray-400">No workout sessions yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Complete a workout to see it here
          </p>
        </div>
      )}

      {sessions.map(session => (
        <SwipeableRow
          key={session.id}
          onSwipeLeft={() => {
            if (confirm('Delete this session?')) {
              deleteSession.mutate(session.id);
            }
          }}
          disabled={deleteSession.isPending}
        >
          <SessionCard
            session={session}
            highlightId={highlightSessionId}
            onDelete={() => deleteSession.mutate(session.id)}
          />
        </SwipeableRow>
      ))}

      {hasMore && (
        <div className="text-center">
          <Button
            variant="secondary"
            onClick={loadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
