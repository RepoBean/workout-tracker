import { useState, useCallback, useEffect, useRef } from 'react';
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
  const weightOverrideKey = `set-weight-${exerciseName}-${setNumber}`;
  const repsOverrideKey = `set-reps-${exerciseName}-${setNumber}`;

  // Use string state for display to prevent leading zeros issue
  const [weight, setWeight] = useState(() => {
    const saved = localStorage.getItem(weightOverrideKey);
    return saved ? parseFloat(saved) : previousWeight;
  });
  const [weightStr, setWeightStr] = useState(() => {
    const saved = localStorage.getItem(weightOverrideKey);
    return saved ?? String(previousWeight);
  });
  const [reps, setReps] = useState(() => {
    const saved = localStorage.getItem(repsOverrideKey);
    return saved ? parseInt(saved, 10) : previousReps;
  });
  const [repsStr, setRepsStr] = useState(() => {
    const saved = localStorage.getItem(repsOverrideKey);
    return saved ?? String(previousReps);
  });

  // Track if user has made manual changes to prevent prop sync from overwriting
  const isDirty = useRef(localStorage.getItem(weightOverrideKey) !== null || localStorage.getItem(repsOverrideKey) !== null);

  // Sync state when previousWeight/previousReps change (e.g., after async data loads)
  useEffect(() => {
    // Only sync from props if user hasn't made manual changes
    if (!isDirty.current) {
      setWeight(previousWeight);
      setWeightStr(String(previousWeight));
      localStorage.removeItem(weightOverrideKey);
    }
  }, [previousWeight]);

  useEffect(() => {
    // Only sync from props if user hasn't made manual changes
    if (!isDirty.current) {
      setReps(previousReps);
      setRepsStr(String(previousReps));
      localStorage.removeItem(repsOverrideKey);
    }
  }, [previousReps]);

  const updateWeight = useCallback((value: number) => {
    const clamped = Math.max(0, value);
    setWeight(clamped);
    setWeightStr(String(clamped));
    isDirty.current = true;
    localStorage.setItem(weightOverrideKey, String(clamped));
  }, [weightOverrideKey]);

  const updateReps = useCallback((value: number) => {
    const clamped = Math.max(1, value);
    setReps(clamped);
    setRepsStr(String(clamped));
    isDirty.current = true;
    localStorage.setItem(repsOverrideKey, String(clamped));
  }, [repsOverrideKey]);

  const handleWeightChange = useCallback((raw: string) => {
    // Allow empty input while typing
    if (raw === '' || raw === '.') {
      setWeightStr(raw);
      setWeight(0);
      isDirty.current = true;
      localStorage.setItem(weightOverrideKey, '0');
      return;
    }
    // Strip leading zeros and parse
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      const clamped = Math.max(0, parsed);
      setWeight(clamped);
      setWeightStr(raw);
      isDirty.current = true;
      localStorage.setItem(weightOverrideKey, String(clamped));
    }
  }, [weightOverrideKey]);

  const handleWeightBlur = useCallback(() => {
    // On blur, normalize the display value
    setWeightStr(String(weight));
  }, [weight]);

  const handleRepsChange = useCallback((raw: string) => {
    // Allow empty input while typing
    if (raw === '') {
      setRepsStr(raw);
      setReps(1);
      isDirty.current = true;
      localStorage.setItem(repsOverrideKey, '1');
      return;
    }
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(1, parsed);
      setReps(clamped);
      setRepsStr(raw);
      isDirty.current = true;
      localStorage.setItem(repsOverrideKey, String(clamped));
    }
  }, [repsOverrideKey]);

  const handleRepsBlur = useCallback(() => {
    // On blur, normalize the display value
    setRepsStr(String(reps));
  }, [reps]);

  const handleLog = () => {
    onLogSet({
      exerciseId,
      exerciseName,
      weight,
      reps,
      setNumber,
      dropIndex: isDropSet ? dropIndex : undefined,
    });
    // Reset dirty flag and clear overrides so next set can receive fresh hints
    isDirty.current = false;
    localStorage.removeItem(weightOverrideKey);
    localStorage.removeItem(repsOverrideKey);
  };

  const label = isDropSet ? `Drop ${dropIndex}` : `Set ${setNumber}`;
  const buttonLabel = isDropSet ? `Log Drop ${dropIndex}` : `Log Set ${setNumber}`;

  return (
    <div className={`rounded-lg p-4 space-y-4 ${isDropSet
      ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800'
      : 'bg-gray-50 dark:bg-gray-800/50'
      }`}>
      <div className={`text-sm font-medium ${isDropSet
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
            onClick={() => updateWeight(weight - 2.5)}
            className="w-14 h-11 text-sm font-medium"
          >
            -2.5
          </Button>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            aria-label="Weight in pounds"
            value={weightStr}
            onChange={(e) => handleWeightChange(e.target.value)}
            onBlur={handleWeightBlur}
            onFocus={(e) => e.target.select()}
            className="w-20 text-center text-lg font-semibold border rounded-lg py-2
                       dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => updateWeight(weight + 2.5)}
            className="w-14 h-11 text-sm font-medium"
          >
            +2.5
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
            onClick={() => updateReps(reps - 1)}
            className="w-12 h-11 text-lg font-semibold"
          >
            -1
          </Button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Number of reps"
            value={repsStr}
            onChange={(e) => handleRepsChange(e.target.value)}
            onBlur={handleRepsBlur}
            onFocus={(e) => e.target.select()}
            className="w-20 text-center text-lg font-semibold border rounded-lg py-2
                       dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => updateReps(reps + 1)}
            className="w-12 h-11 text-lg font-semibold"
          >
            +1
          </Button>
        </div>
        <span className="w-8 shrink-0"></span>
      </div>

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
