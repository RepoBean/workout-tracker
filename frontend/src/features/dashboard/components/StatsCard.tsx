import { useStats } from '../../../shared/api/queries';

export function StatsCard() {
  const { data: stats, isLoading } = useStats();

  if (isLoading || !stats) return null;

  const statItems = [
    { value: stats.weekStreak, label: 'Week Streak', highlight: stats.weekStreak > 0 },
    { value: stats.sessionsLast30Days, label: '30-Day', highlight: false },
    { value: stats.totalSessions, label: 'Total', highlight: false },
  ];

  return (
    <div className="card">
      <div className="grid grid-cols-3 gap-3">
        {statItems.map(({ value, label, highlight }) => (
          <div key={label} className="text-center py-2">
            <p className={`text-3xl font-display font-bold tabular-nums ${
              highlight ? 'text-accent-500' : 'text-primary-600 dark:text-primary-400'
            }`}>
              {value}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
