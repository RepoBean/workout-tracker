import { useState, useCallback } from 'react';
import { Button } from '../../../shared/ui/Button';
import { PlateCalculator } from './PlateCalculator';

interface SetInputProps {
  exerciseId: number | null;
  exerciseName: string;
  setNumber: number;
  previousWeight?: number;
  previousReps?: number;
  onLogSet: (data: {
    exerciseId: number | null;
    exerciseName: string;
    weight: number;
    reps: number;
    setNumber: number;
    perceivedEffort?: number;
    dropIndex?: number;
  }) => void;
  isLogging?: boolean;
  dropIndex?: number;
  isDropSet?: boolean;
}

export function SetInput({
  exerciseId,
  exerciseName,
  setNumber,
  previousWeight = 0,
  previousReps = 10,
  onLogSet,
  isLogging = false,
  dropIndex,
  isDropSet = false,
}: SetInputProps) {
  const [weight, setWeight] = useState(previousWeight);
  const [reps, setReps] = useState(previousReps);
  const [showRpe, setShowRpe] = useState(false);
  const [rpe, setRpe] = useState<number | null>(null);

  const adjustWeight = useCallback((delta: number) => {
    setWeight(w => Math.max(0, w + delta));
  }, []);

  const adjustReps = useCallback((delta: number) => {
    setReps(r => Math.max(1, r + delta));
  }, []);

  const handleLog = () => {
    onLogSet({
      exerciseId,
      exerciseName,
      weight,
      reps,
      setNumber,
      perceivedEffort: rpe || undefined,
      dropIndex: isDropSet ? dropIndex : undefined,
    });
    // Reset RPE for next set
    setRpe(null);
    setShowRpe(false);
  };

  const label = isDropSet ? `Drop ${dropIndex}` : `Set ${setNumber}`;
  const buttonLabel = isDropSet ? `Log Drop ${dropIndex}` : `Log Set ${setNumber}`;

  return (
    <div className={`rounded-lg p-4 space-y-4 ${
      isDropSet
        ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800'
        : 'bg-gray-50 dark:bg-gray-800/50'
    }`}>
      <div className={`text-sm font-medium ${
        isDropSet
          ? 'text-orange-600 dark:text-orange-400'
          : 'text-gray-500 dark:text-gray-400'
      }`}>
        {label}
      </div>

      {/* Weight Input */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium w-14 shrink-0">Weight</span>
        <div className="flex items-center gap-1 flex-1 justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => adjustWeight(-5)}
            className="w-11 h-11 text-base font-semibold"
          >
            -5
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => adjustWeight(-2.5)}
            className="w-10 h-11 text-xs"
          >
            -2.5
          </Button>
          <input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(Math.max(0, Number(e.target.value)))}
            className="w-20 text-center text-lg font-semibold border rounded-lg py-2
                       dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => adjustWeight(2.5)}
            className="w-10 h-11 text-xs"
          >
            +2.5
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => adjustWeight(5)}
            className="w-11 h-11 text-base font-semibold"
          >
            +5
          </Button>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400 w-8 shrink-0">lbs</span>
      </div>

      {/* Plate Calculator */}
      {weight > 45 && <PlateCalculator weight={weight} />}

      {/* Reps Input */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium w-14 shrink-0">Reps</span>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => adjustReps(-1)}
            className="w-12 h-11 text-lg font-semibold"
          >
            -1
          </Button>
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(Math.max(1, Number(e.target.value)))}
            className="w-20 text-center text-lg font-semibold border rounded-lg py-2
                       dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => adjustReps(1)}
            className="w-12 h-11 text-lg font-semibold"
          >
            +1
          </Button>
        </div>
        <span className="w-8 shrink-0"></span>
      </div>

      {/* RPE Toggle */}
      {showRpe ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">RPE:</span>
          {[6, 7, 8, 9, 10].map((value) => (
            <button
              key={value}
              onClick={() => setRpe(rpe === value ? null : value)}
              className={`w-9 h-9 rounded-full text-sm font-medium transition-colors
                ${rpe === value
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
            >
              {value}
            </button>
          ))}
          <button
            onClick={() => {
              setShowRpe(false);
              setRpe(null);
            }}
            className="text-sm text-gray-500 dark:text-gray-400 ml-2"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowRpe(true)}
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          + Add RPE
        </button>
      )}

      {/* Log Button */}
      <Button
        variant="primary"
        size="lg"
        onClick={handleLog}
        disabled={isLogging}
        className="w-full"
      >
        {isLogging ? 'Logging...' : buttonLabel}
      </Button>
    </div>
  );
}
