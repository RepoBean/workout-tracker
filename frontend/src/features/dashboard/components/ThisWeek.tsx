import { useMemo } from 'react';
import { useStats, useCalendarSessions } from '../../../shared/api/queries';

// Sunday-first, matching the calendar below.
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * "This week" card — the dashboard's consistency mirror. Seven discs for the
 * current Sun–Sat week (filled = trained that day, ring = today), the week
 * streak as an accent chip only when it's alive, and the summary counts as a
 * single quiet line instead of a row of big stat tiles.
 */
export function ThisWeek() {
  const { data: stats } = useStats();

  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());

  // The calendar month query is shared with <Calendar>; the second call only
  // fetches when the week started in the previous month (same key otherwise).
  const { data: monthSessions } = useCalendarSessions(now.getFullYear(), now.getMonth());
  const { data: startMonthSessions } = useCalendarSessions(
    weekStart.getFullYear(),
    weekStart.getMonth()
  );

  const trainedDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const session of [...(monthSessions ?? []), ...(startMonthSessions ?? [])]) {
      if (session.completedAt) {
        keys.add(new Date(session.completedAt).toDateString());
      }
    }
    return keys;
  }, [monthSessions, startMonthSessions]);

  const days = DAY_INITIALS.map((initial, i) => {
    const date = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    return {
      key: i,
      initial,
      trained: trainedDayKeys.has(date.toDateString()),
      isToday: date.toDateString() === now.toDateString(),
      isFuture: date.getTime() > now.getTime() && date.toDateString() !== now.toDateString(),
    };
  });
  const trainedThisWeek = days.filter((d) => d.trained).length;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 min-h-[22px]">
        <p className="eyebrow text-gray-400 dark:text-gray-500">This week</p>
        {stats && stats.weekStreak > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-300 text-xs font-semibold">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M13.5 0.67s0.74 2.65 0.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l0.03-0.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-0.36 3.6-1.21 4.62-2.58 0.39 1.29 0.59 2.65 0.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
            </svg>
            {stats.weekStreak}-week streak
          </span>
        )}
      </div>

      <div
        className="flex justify-between gap-1"
        role="img"
        aria-label={`${trainedThisWeek} of 7 days trained this week`}
      >
        {days.map((d) => (
          <div key={d.key} className="flex flex-col items-center gap-1.5 flex-1">
            <span
              className={`text-[11px] ${
                d.isToday
                  ? 'font-semibold text-primary-600 dark:text-primary-400'
                  : 'font-medium text-gray-400 dark:text-gray-500'
              }`}
            >
              {d.initial}
            </span>
            <span
              className={`w-9 h-9 rounded-full flex items-center justify-center ${
                d.trained
                  ? 'bg-primary-600 text-white'
                  : d.isFuture
                    ? 'border border-dashed border-gray-200 dark:border-surface-700'
                    : 'bg-gray-100 dark:bg-surface-700'
              } ${
                d.isToday
                  ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-surface-800'
                  : ''
              }`}
            >
              {d.trained && (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
          </div>
        ))}
      </div>

      {stats && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {trainedThisWeek} workout{trainedThisWeek !== 1 ? 's' : ''} this week ·{' '}
          {stats.sessionsLast30Days} in the last 30 days · {stats.totalSessions} all time
        </p>
      )}
    </div>
  );
}
