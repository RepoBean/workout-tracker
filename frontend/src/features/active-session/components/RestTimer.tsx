import { useTimer } from '../../../shared/context/TimerContext';
import { Button } from '../../../shared/ui/Button';

const PRESET_DURATIONS = [
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '2m', seconds: 120 },
];

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function RestTimer() {
  const {
    isRunning,
    timeRemaining,
    progress,
    startTimer,
    extendTimer,
    skipTimer,
    notificationPermission,
    requestNotificationPermission,
  } = useTimer();

  if (!isRunning) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Rest Timer
          </span>
          {notificationPermission === 'default' && (
            <button
              onClick={requestNotificationPermission}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              Enable alerts
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {PRESET_DURATIONS.map(({ label, seconds }) => (
            <Button
              key={seconds}
              variant="secondary"
              size="sm"
              onClick={() => startTimer(seconds)}
              className="flex-1"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-200
                    dark:border-primary-800 rounded-xl shadow-sm p-4 mb-4">
      {/* Progress bar */}
      <div className="h-1.5 bg-primary-200 dark:bg-primary-800 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-primary-600 rounded-full transition-all duration-100"
          style={{ width: `${100 - progress}%` }}
        />
      </div>

      {/* Time display */}
      <div className="text-center mb-3">
        <span className="text-4xl font-bold font-mono tabular-nums text-primary-700 dark:text-primary-300">
          {formatTime(timeRemaining)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => extendTimer(30)}
          className="flex-1"
        >
          +30s
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={skipTimer}
          className="flex-1"
        >
          Skip
        </Button>
      </div>
    </div>
  );
}
