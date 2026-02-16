import { Button } from '../../../shared/ui/Button';
import { TimerIndicator } from '../../../shared/ui/TimerIndicator';
import type { ActiveSession } from '../../../shared/api/types';

interface SessionHeaderProps {
  session: ActiveSession;
  totalSetsLogged: number;
  totalSetsTarget: number;
  onComplete: () => void;
  isCompleting: boolean;
}

export function SessionHeader({
  session,
  totalSetsLogged,
  totalSetsTarget,
  onComplete,
  isCompleting,
}: SessionHeaderProps) {
  const progress = totalSetsTarget > 0
    ? Math.round((totalSetsLogged / totalSetsTarget) * 100)
    : 0;

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10 -mx-4 px-4 py-2 mb-4">
      {/* Workout name + Complete button */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{session.workoutName}</h1>
          {session.programName && session.programName !== 'Ad-hoc' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{session.programName}</p>
          )}
        </div>

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

      {/* Progress bar + percentage */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${progress >= 100 ? 'bg-green-500' : 'bg-primary-600'
              }`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {progress}%
        </span>
      </div>
    </div>
  );
}
