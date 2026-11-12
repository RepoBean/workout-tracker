import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../shared/ui/Button';
import { openServerDownload } from '../../shared/api/download';
import { SwipeableRow } from '../../shared/ui/SwipeableRow';
import { useSession } from '../../shared/api/queries';
import { useSessionHistory, useDeleteSession } from './hooks/useHistory';
import { parseSessionIdParam, sessionToFetch } from './logic/deepLink';
import { SessionCard } from './components/SessionCard';
import { LogPastWorkout } from './components/LogPastWorkout';

export default function History() {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightSessionId = searchParams.get('sessionId');
  const linkedId = parseSessionIdParam(highlightSessionId);
  const { sessions, isLoading, error, hasMore, loadMore, isLoadingMore } = useSessionHistory(linkedId);
  // A linked session older than the loaded list is fetched on its own and pinned on top.
  const pinnedId = sessionToFetch(linkedId, isLoading || error ? undefined : sessions);
  const pinned = useSession(pinnedId ?? 0);
  const pinnedSession = pinnedId !== null && pinned.data?.completedAt ? pinned.data : null;
  const pinnedMissing = pinnedId !== null && (pinned.isError || (pinned.data && !pinned.data.completedAt));
  const deleteSession = useDeleteSession();
  const deleteFromHistory = (id: number) =>
    deleteSession.mutate(id, {
      // Deleting the linked session drops the link, else the pinned fetch would 404.
      onSuccess: () => { if (id === linkedId) setSearchParams({}, { replace: true }); },
    });
  const [showLogPast, setShowLogPast] = useState(false);

  const handleExport = () => {
    openServerDownload('/sessions/export-csv');
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
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowLogPast(true)}>
            Log past
          </Button>
          {sessions.length > 0 && (
            <Button variant="secondary" size="sm" onClick={handleExport}>
              Export CSV
            </Button>
          )}
        </div>
      </div>
      <LogPastWorkout isOpen={showLogPast} onClose={() => setShowLogPast(false)} />

      {pinnedSession && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">Linked session</p>
          <SwipeableRow
            onSwipeLeft={() => {
              if (confirm('Delete this session?')) {
                deleteFromHistory(pinnedSession.id);
              }
            }}
            disabled={deleteSession.isPending}
          >
            <SessionCard
              session={pinnedSession}
              highlightId={highlightSessionId}
              onDelete={() => deleteFromHistory(pinnedSession.id)}
            />
          </SwipeableRow>
        </div>
      )}
      {pinnedMissing && (
        <div className="card text-sm text-gray-500 dark:text-gray-400">
          That session isn't in your history any more.
        </div>
      )}

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
              deleteFromHistory(session.id);
            }
          }}
          disabled={deleteSession.isPending}
        >
          <SessionCard
            session={session}
            highlightId={highlightSessionId}
            onDelete={() => deleteFromHistory(session.id)}
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
