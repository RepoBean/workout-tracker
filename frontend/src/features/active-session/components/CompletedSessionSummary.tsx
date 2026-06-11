import { Link } from 'react-router-dom';
import type { ActiveSession } from '../../../shared/api/types';

interface CompletedSessionSummaryProps {
  session: ActiveSession;
}

/**
 * Read-only summary shown when navigating to an already-completed session
 * (e.g. via a stale link or back button). The just-completed flow shows
 * CompletionCelebration instead.
 */
export function CompletedSessionSummary({ session }: CompletedSessionSummaryProps) {
  const sets = session.sets || [];
  const totalSets = sets.filter(s => (s.dropIndex || 0) === 0).length;
  const totalVolume = sets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
  const duration = session.completedAt && session.createdAt
    ? Math.round((new Date(session.completedAt).getTime() - new Date(session.createdAt).getTime()) / 60000)
    : 0;

  const formatVolume = (v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return String(v);
  };

  return (
    <div className="text-center py-12 px-4">
      <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full
                     flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none"
          viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold mb-1">{session.workoutName}</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Completed on {session.completedAt ? new Date(session.completedAt).toLocaleDateString() : ''}
      </p>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4 mb-6 max-w-xs mx-auto">
        <div className="bg-gray-50 dark:bg-surface-800 rounded-lg p-3">
          <p className="text-2xl font-display font-bold">{totalSets}</p>
          <p className="text-xs text-gray-500">Sets</p>
        </div>
        <div className="bg-gray-50 dark:bg-surface-800 rounded-lg p-3">
          <p className="text-2xl font-display font-bold">{formatVolume(totalVolume)}</p>
          <p className="text-xs text-gray-500">lbs</p>
        </div>
        <div className="bg-gray-50 dark:bg-surface-800 rounded-lg p-3">
          <p className="text-2xl font-display font-bold">{duration}</p>
          <p className="text-xs text-gray-500">min</p>
        </div>
      </div>

      <div className="space-x-4">
        <Link to="/history" className="text-primary-600 hover:underline">
          View History
        </Link>
        <Link to="/" className="text-primary-600 hover:underline">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
