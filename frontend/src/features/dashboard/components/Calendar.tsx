import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCalendarSessions } from '../../../shared/api/queries';

// Sunday-first, matching the This Week strip above.
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const TODAY_RING =
  'ring-2 ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-surface-800';

export function Calendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const navigate = useNavigate();

  const { data: sessions, isLoading } = useCalendarSessions(year, month);

  const { workoutDays, sessionByDay } = useMemo(() => {
    const days = new Set<number>();
    const sessionMap = new Map<number, number>(); // day -> sessionId
    if (!sessions) return { workoutDays: days, sessionByDay: sessionMap };

    for (const session of sessions) {
      if (session.completedAt) {
        const date = new Date(session.completedAt);
        if (date.getMonth() === month && date.getFullYear() === year) {
          const day = date.getDate();
          days.add(day);
          if (!sessionMap.has(day)) {
            sessionMap.set(day, session.id); // first session wins
          }
        }
      }
    }
    return { workoutDays: days, sessionByDay: sessionMap };
  }, [sessions, month, year]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Adjacent-month days render as blank cells — the grid aligns without them
    // competing with the month's own numbers.
    const days: Array<number | null> = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    while (days.length % 7 !== 0) days.push(null);

    return days;
  }, [year, month]);

  const goToPrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(y => y - 1);
    } else {
      setMonth(m => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(y => y + 1);
    } else {
      setMonth(m => m + 1);
    }
  };

  const isToday = (day: number) => {
    return day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goToPrevMonth}
          aria-label="Previous month"
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-700 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center text-gray-500 dark:text-gray-400"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="font-display font-bold">
          {MONTH_NAMES[month]} {year}
        </h3>
        <button
          onClick={goToNextMonth}
          aria-label="Next month"
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-700 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center text-gray-500 dark:text-gray-400"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_INITIALS.map((day, i) => (
          <div
            key={i}
            className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500 py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day, index) => {
          if (day === null) {
            return <div key={index} className="py-1" aria-hidden />;
          }

          const hasWorkout = workoutDays.has(day);
          const today = isToday(day);
          const cellBase = 'w-9 h-9 flex items-center justify-center rounded-full text-sm';

          return (
            <div key={index} className="flex items-center justify-center py-1">
              {hasWorkout ? (
                <button
                  onClick={() => navigate(`/history?sessionId=${sessionByDay.get(day)}`)}
                  aria-label={`View workout on ${MONTH_NAMES[month]} ${day}`}
                  className={`${cellBase} bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-colors ${
                    today ? TODAY_RING : ''
                  }`}
                >
                  {day}
                </button>
              ) : (
                <span
                  className={`${cellBase} ${
                    today
                      ? `font-bold text-primary-600 dark:text-primary-400 ${TODAY_RING}`
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {day}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Session count for month */}
      {!isLoading && (
        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
          {workoutDays.size} workout{workoutDays.size !== 1 ? 's' : ''} in {MONTH_NAMES[month]}
        </div>
      )}
    </div>
  );
}
