import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Button } from '../../../shared/ui/Button';

interface CompletionCelebrationProps {
  isOpen: boolean;
  workoutName: string;
  totalSets: number;
  totalVolume: number;
  duration: number; // in minutes
  onDismiss: () => void;
}

export function CompletionCelebration({
  isOpen,
  workoutName,
  totalSets,
  totalVolume,
  duration,
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
          colors: ['#4f46e5', '#10b981', '#f59e0b'],
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.7 },
          colors: ['#4f46e5', '#10b981', '#f59e0b'],
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full text-center shadow-xl">
        {/* Checkmark */}
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold mb-2">Workout Complete!</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{workoutName}</p>
        <p className="text-xl font-semibold text-primary-600 mb-6">{message}</p>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <p className="text-2xl font-bold">{totalSets}</p>
            <p className="text-xs text-gray-500">Sets</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{formatVolume(totalVolume)}</p>
            <p className="text-xs text-gray-500">lbs</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{duration}</p>
            <p className="text-xs text-gray-500">min</p>
          </div>
        </div>

        <Button variant="primary" size="lg" onClick={onDismiss} className="w-full">
          Done
        </Button>
      </div>
    </div>
  );
}
