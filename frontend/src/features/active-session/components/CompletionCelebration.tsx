import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Button } from '../../../shared/ui/Button';
import { TimeInZoneBar } from '../../../shared/ui/TimeInZoneBar';
import { SessionHRChart } from '../../history/components/SessionHRChart';

interface CompletionCelebrationProps {
  isOpen: boolean;
  workoutName: string;
  totalSets: number;
  totalVolume: number;
  duration: number; // in minutes
  avgRpe?: number | null;
  hrSeries?: { t: number[]; b: number[] } | null;
  onDismiss: () => void;
}

export function CompletionCelebration({
  isOpen,
  workoutName,
  totalSets,
  totalVolume,
  duration,
  avgRpe,
  hrSeries,
  onDismiss,
}: CompletionCelebrationProps) {
  useEffect(() => {
    if (isOpen) {
      // Fire confetti
      const duration = 2000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.7 },
          colors: ['#0d9488', '#10b981', '#f59e0b'],
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.7 },
          colors: ['#0d9488', '#10b981', '#f59e0b'],
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };

      frame();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatVolume = (v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return String(v);
  };

  const messages = [
    "Great work!",
    "You crushed it!",
    "Beast mode!",
    "Gains incoming!",
    "Another one in the books!",
  ];
  const message = messages[Math.floor(Math.random() * messages.length)];

  const hasSeries = hrSeries && hrSeries.t.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white dark:bg-surface-800 rounded-2xl p-6 ${hasSeries ? 'max-w-md' : 'max-w-sm'} w-full text-center shadow-modal dark:border dark:border-white/[0.06] max-h-[90vh] overflow-y-auto`}>
        {/* Checkmark */}
        <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-2xl font-display font-bold mb-1">Workout Complete!</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-2">{workoutName}</p>
        <p className="text-xl font-display font-bold text-primary-600 dark:text-primary-400 mb-6">{message}</p>

        {hasSeries && (
          <div className="mb-4 -mx-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Heart Rate</p>
            <SessionHRChart series={hrSeries} mode="continuous" />
            <div className="mx-2 mt-2 text-left">
              <TimeInZoneBar series={hrSeries} />
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className={`grid ${avgRpe != null ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-3 mb-6`}>
          <div className="bg-surface-100 dark:bg-surface-850 rounded-card py-3 px-2">
            <p className="text-2xl font-display font-bold tabular-nums">{totalSets}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Sets</p>
          </div>
          <div className="bg-surface-100 dark:bg-surface-850 rounded-card py-3 px-2">
            <p className="text-2xl font-display font-bold tabular-nums">{formatVolume(totalVolume)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">lbs</p>
          </div>
          <div className="bg-surface-100 dark:bg-surface-850 rounded-card py-3 px-2">
            <p className="text-2xl font-display font-bold tabular-nums">{duration}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">min</p>
          </div>
          {avgRpe != null && (
            <div className="bg-surface-100 dark:bg-surface-850 rounded-card py-3 px-2">
              <p className="text-2xl font-display font-bold tabular-nums">{avgRpe.toFixed(1)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Avg RPE</p>
            </div>
          )}
        </div>

        <Button variant="primary" size="lg" onClick={onDismiss} className="w-full">
          Done
        </Button>
      </div>
    </div>
  );
}
