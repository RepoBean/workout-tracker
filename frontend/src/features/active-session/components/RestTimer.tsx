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

  // Compact idle state - single line with timer icon and preset buttons
  if (!isRunning) {
    return (
      <div className="flex items-center gap-2 py-2 px-3 mb-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <span className="text-gray-500 dark:text-gray-400 text-sm">⏱ Rest</span>
        <div className="flex gap-1 flex-1">
          {PRESET_DURATIONS.map(({ label, seconds }) => (
            <Button
              key={seconds}
              variant="secondary"
              size="sm"
              onClick={() => startTimer(seconds)}
              className="flex-1 text-xs py-1 min-h-[44px]"
            >
              {label}
            </Button>
          ))}
        </div>
        {notificationPermission === 'default' && (
          <button
            onClick={requestNotificationPermission}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
          >
            🔔
          </button>
        )}
      </div>
    );
  }

  // Active timer - emphasized but still compact
  return (
    <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200
                    dark:border-primary-800 rounded-lg p-3 mb-3">
      {/* Progress bar */}
      <div className="h-1 bg-primary-200 dark:bg-primary-800 rounded-full mb-2 overflow-hidden">
        <div
          className="h-full bg-primary-600 rounded-full transition-all duration-100"
          style={{ width: `${100 - progress}%` }}
        />
      </div>

      {/* Time and controls in one row */}
      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold font-mono tabular-nums text-primary-700 dark:text-primary-300">
          {formatTime(timeRemaining)}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => extendTimer(30)}
            className="text-xs"
          >
            +30s
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={skipTimer}
            className="text-xs"
          >
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
