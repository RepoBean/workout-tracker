import { useStats } from '../../../shared/api/queries';

export function StatsCard() {
  const { data: stats, isLoading } = useStats();

  if (isLoading || !stats) return null;

  return (
    <div className="card">
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
        Your Stats
      </h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-2xl font-bold text-primary-600">{stats.weekStreak}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Active Weeks</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-primary-600">{stats.sessionsLast30Days}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">30-Day Workouts</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-primary-600">{stats.totalSessions}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Workouts</p>
        </div>
      </div>
    </div>
  );
}
