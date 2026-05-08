import { useEffect, useState } from 'react';
import { Button } from '../../../shared/ui/Button';
import { TimerIndicator } from '../../../shared/ui/TimerIndicator';
import { HeartRatePill } from '../../../shared/ui/HeartRatePill';
import type { ActiveSession } from '../../../shared/api/types';

interface SessionHeaderProps {
  session: ActiveSession;
  totalSetsLogged: number;
  totalSetsTarget: number;
  onComplete: () => void;
  isCompleting: boolean;
  onToggleHrChart?: () => void;
}

function formatElapsed(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function SessionHeader({
  session,
  totalSetsLogged,
  totalSetsTarget,
  onComplete,
  isCompleting,
  onToggleHrChart,
}: SessionHeaderProps) {
  const progress = totalSetsTarget > 0
    ? Math.round((totalSetsLogged / totalSetsTarget) * 100)
    : 0;

  const startMs = new Date(session.createdAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));

  return (
    <div className="bg-white dark:bg-surface-850 shadow-sm sticky top-0 z-10 -mx-4 px-4 py-3 mb-4 border-b border-gray-100 dark:border-white/[0.06]">
      {/* Workout name + Complete button */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-display font-bold truncate">{session.workoutName}</h1>
          {session.programName && session.programName !== 'Ad-hoc' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{session.programName}</p>
          )}
        </div>

        <HeartRatePill onTogglePanel={onToggleHrChart} />
        <TimerIndicator />

        {/* Complete button */}
        <Button
          variant={progress >= 100 ? 'primary' : 'secondary'}
          size="sm"
          onClick={onComplete}
          disabled={isCompleting || totalSetsLogged === 0}
          className="shrink-0"
        >
          {isCompleting ? '...' : 'Complete'}
        </Button>
      </div>

      {/* Elapsed time + Progress bar + percentage */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-display font-bold text-gray-600 dark:text-gray-400 whitespace-nowrap tabular-nums">
          {formatElapsed(elapsedSec)}
        </span>
        <div className="flex-1 h-2.5 bg-gray-200 dark:bg-surface-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${progress >= 100 ? 'bg-green-500' : 'bg-gradient-to-r from-primary-500 to-primary-400'
              }`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <span className="text-xs font-display font-bold text-gray-600 dark:text-gray-400 whitespace-nowrap tabular-nums">
          {progress}%
        </span>
      </div>
    </div>
  );
}
