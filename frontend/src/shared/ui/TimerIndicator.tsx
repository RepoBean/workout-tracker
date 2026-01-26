import { useTimer } from '../context/TimerContext';

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TimerIndicator() {
  const { isRunning, timeRemaining, skipTimer } = useTimer();

  if (!isRunning) return null;

  const isUrgent = timeRemaining <= 10;

  return (
    <button
      onClick={skipTimer}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium
                  bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300
                  hover:bg-primary-200 dark:hover:bg-primary-900/70 transition-colors
                  ${isUrgent ? 'animate-pulse' : ''}`}
      title="Tap to skip timer"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="font-mono tabular-nums">{formatTime(timeRemaining)}</span>
    </button>
  );
}
