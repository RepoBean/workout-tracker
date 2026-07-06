import { useEffect, useState } from 'react';
import { useHeartRate } from '../../../shared/context/HeartRateContext';
import { downsampleHr } from '../../../shared/utils/heartRate';
import { SessionHRChart } from '../../history/components/SessionHRChart';

interface Props {
  sessionStartMs: number;
  onClose?: () => void;
}

export function LiveHRChart({ sessionStartMs, onClose }: Props) {
  const { samplesSince, isConnected, currentBpm, deviceName, disconnect } = useHeartRate();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const samples = samplesSince(sessionStartMs);
  const series = downsampleHr(samples, sessionStartMs);

  // Live tail: pin the newest point to the latest raw reading so the chart
  // tip tracks the header pill instead of lagging a partial 5 s bucket average.
  if (series && samples.length > 0) {
    const last = samples[samples.length - 1];
    const t = Math.floor((last.ts - sessionStartMs) / 1000);
    if (t > series.t[series.t.length - 1]) {
      series.t.push(t);
      series.b.push(last.bpm);
    }
  }

  if (!isConnected || !series || series.t.length < 2) return null;

  const handleDisconnect = () => {
    if (confirm(`Disconnect ${deviceName ?? 'heart rate monitor'}?`)) {
      disconnect();
    }
  };

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Heart Rate
        </span>
        <div className="flex items-center gap-3">
          {currentBpm != null && (
            <span className="text-sm font-semibold text-red-600 dark:text-red-400">
              ♥ {currentBpm} bpm
            </span>
          )}
          <button
            type="button"
            onClick={handleDisconnect}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            Disconnect
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Hide heart rate chart"
              className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="-mx-2">
        <SessionHRChart series={series} mode="continuous" />
      </div>
    </div>
  );
}
