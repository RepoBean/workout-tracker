import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCalendarSessions } from '../../../shared/api/queries';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

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
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: Array<{ day: number; isCurrentMonth: boolean }> = [];

    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrentMonth: false });
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, isCurrentMonth: true });
    }

    // Next month padding (fill to complete 6 rows max)
    const remaining = 42 - days.length; // 6 weeks * 7 days
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, isCurrentMonth: false });
    }

    // Only show 5 rows if possible
    if (days.length > 35) {
      const lastRow = days.slice(35);
      if (lastRow.every(d => !d.isCurrentMonth)) {
        days.splice(35);
      }
    }

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

  const isToday = (day: number, isCurrentMonth: boolean) => {
    return isCurrentMonth && day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goToPrevMonth}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
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
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-0">
        {calendarDays.map(({ day, isCurrentMonth }, index) => {
          const hasWorkout = isCurrentMonth && workoutDays.has(day);
          const today = isToday(day, isCurrentMonth);

          const handleDayClick = hasWorkout
            ? () => navigate(`/history?sessionId=${sessionByDay.get(day)}`)
            : undefined;

          return (
            <div
              key={index}
              className={`relative flex flex-col items-center py-1.5 text-sm ${isCurrentMonth
                ? 'text-gray-900 dark:text-gray-100'
                : 'text-gray-300 dark:text-gray-600'
                } ${hasWorkout ? 'cursor-pointer' : ''}`}
              onClick={handleDayClick}
            >
              <span
                className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${today
                  ? 'bg-primary-600 text-white font-bold'
                  : hasWorkout
                    ? 'hover:bg-primary-50 dark:hover:bg-primary-900/30'
                    : ''
                  }`}
              >
                {day}
              </span>
              {hasWorkout && !today && (
                <div className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-0.5" />
              )}
              {hasWorkout && today && (
                <div className="w-1.5 h-1.5 rounded-full bg-primary-300 mt-0.5" />
              )}
            </div>
          );
        })}
      </div>

      {/* Session count for month */}
      {!isLoading && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
          {workoutDays.size} workout{workoutDays.size !== 1 ? 's' : ''} this month
        </div>
      )}
    </div>
  );
}
