import { useHeartRate } from '../context/HeartRateContext';

interface HeartRatePillProps {
  // When provided and connected, tapping the pill calls this instead of
  // prompting for disconnect. Used by ActiveSession to toggle the live chart.
  onTogglePanel?: () => void;
}

export function HeartRatePill({ onTogglePanel }: HeartRatePillProps = {}) {
  const {
    isSupported,
    isConnected,
    isConnecting,
    currentBpm,
    deviceName,
    connect,
    disconnect,
  } = useHeartRate();

  if (!isSupported) return null;

  if (isConnecting) {
    return (
      <div className="flex items-center gap-1.5 px-3 min-h-[40px] rounded-full bg-gray-100 dark:bg-surface-800 text-xs text-gray-600 dark:text-gray-300">
        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span>Pairing…</span>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <button
        onClick={connect}
        className="flex items-center gap-1.5 px-3 min-h-[40px] rounded-full bg-gray-100 dark:bg-surface-800 hover:bg-gray-200 dark:hover:bg-surface-700 text-xs text-gray-600 dark:text-gray-300 transition-colors"
        aria-label="Connect heart rate monitor"
        type="button"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
        </svg>
        <span>HR</span>
      </button>
    );
  }

  const handleClick = onTogglePanel
    ? onTogglePanel
    : () => {
        if (confirm(`Disconnect ${deviceName ?? 'heart rate monitor'}?`)) {
          disconnect();
        }
      };
  const ariaLabel = onTogglePanel
    ? `Heart rate ${currentBpm ?? '—'} BPM, tap to toggle chart`
    : `Heart rate ${currentBpm ?? '—'} BPM, tap to disconnect`;

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-3 min-h-[40px] rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors tabular-nums"
      aria-label={ariaLabel}
      type="button"
    >
      <svg className="w-3.5 h-3.5 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
      <span className="font-semibold text-sm leading-none">{currentBpm ?? '—'}</span>
    </button>
  );
}
