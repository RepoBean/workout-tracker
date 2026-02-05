import { useStats } from '../../../shared/api/queries';

function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(0)}K`;
  return String(volume);
}

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
          <p className="text-2xl font-bold text-primary-600">{stats.sessionsLast7Days}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">This Week</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-primary-600">
            {stats.weekStreak}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Week Streak
          </p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-primary-600">
            {formatVolume(stats.monthVolume)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            lbs This Month
          </p>
        </div>
      </div>
    </div>
  );
}
