import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { PlateCalculator } from './PlateCalculator';
import { AssistToggle } from './AssistToggle';
import { getSetInputStorageKeys } from '../lib/sessionStorage';

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
  }) => void;
  isLogging?: boolean;
}

export function SetInput({
  exerciseId,
  exerciseName,
  setNumber,
  previousWeight = 0,
  previousReps = 10,
  onLogSet,
  isLogging = false,
}: SetInputProps) {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const { weight: weightOverrideKey, reps: repsOverrideKey } =
    getSetInputStorageKeys(sessionId, exerciseName, setNumber);

  // `weight` is the signed value that gets logged (negative = assisted). The text box
  // shows only its magnitude; `assisted` carries the sign (the decimal keypad has no
  // minus key) and survives passing through 0 so "assist" + typing 40 gives −40.
  const [weight, setWeight] = useState(() => {
    const saved = localStorage.getItem(weightOverrideKey);
    return saved ? parseFloat(saved) : previousWeight;
  });
  const [assisted, setAssisted] = useState(() => weight < 0);
  // Use string state for display to prevent leading zeros issue
  const [weightStr, setWeightStr] = useState(() => String(Math.abs(weight)));
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
      setAssisted(previousWeight < 0);
      setWeightStr(String(Math.abs(previousWeight)));
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

  // Steppers move the signed value, so +2.5 is always "heavier" (less assistance)
  // and crosses zero cleanly: −2.5 → 0 → 2.5.
  const updateWeight = useCallback((value: number) => {
    const next = value || 0; // normalize -0
    setWeight(next);
    setAssisted(prev => next < 0 || (next === 0 && prev));
    setWeightStr(String(Math.abs(next)));
    isDirty.current = true;
    localStorage.setItem(weightOverrideKey, String(next));
  }, [weightOverrideKey]);

  const toggleAssisted = useCallback(() => {
    const nextAssisted = !assisted;
    const next = (nextAssisted ? -1 : 1) * Math.abs(weight) || 0;
    setAssisted(nextAssisted);
    setWeight(next);
    isDirty.current = true;
    localStorage.setItem(weightOverrideKey, String(next));
  }, [assisted, weight, weightOverrideKey]);

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
    // Strip leading zeros and parse; the box holds a magnitude, the toggle the sign
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      const next = (assisted ? -1 : 1) * Math.abs(parsed) || 0;
      setWeight(next);
      setWeightStr(raw);
      isDirty.current = true;
      localStorage.setItem(weightOverrideKey, String(next));
    }
  }, [assisted, weightOverrideKey]);

  const handleWeightBlur = useCallback(() => {
    // On blur, normalize the display value
    setWeightStr(String(Math.abs(weight)));
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
    });
    // Reset dirty flag and clear overrides so next set can receive fresh hints
    isDirty.current = false;
    localStorage.removeItem(weightOverrideKey);
    localStorage.removeItem(repsOverrideKey);
  };

  return (
    <div className="rounded-card p-4 space-y-4 bg-surface-100 dark:bg-surface-850">
      <div className="text-sm font-display font-bold text-gray-500 dark:text-gray-400">
        Set {setNumber}
      </div>

      {/* Weight Input */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium w-14 shrink-0">Weight</span>
        <div className="flex items-center gap-1.5 flex-1 justify-center">
          <button
            onClick={() => updateWeight(weight - 2.5)}
            className="w-12 h-12 rounded-lg text-sm font-semibold bg-gray-200 dark:bg-surface-800 text-gray-700 dark:text-gray-300 active:scale-95 transition-all"
          >
            -2.5
          </button>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            aria-label={assisted ? 'Assistance in pounds' : 'Weight in pounds'}
            value={weightStr}
            onChange={(e) => handleWeightChange(e.target.value)}
            onBlur={handleWeightBlur}
            onFocus={(e) => e.target.select()}
            className={`w-24 text-center text-2xl font-display font-bold border-2 rounded-lg py-2 tabular-nums
                       bg-white dark:bg-surface-900 focus:ring-0 transition-colors
                       ${assisted
                         ? 'border-accent-300 dark:border-accent-700 text-accent-700 dark:text-accent-300 focus:border-accent-500'
                         : 'border-gray-200 dark:border-surface-800 dark:text-white focus:border-primary-500'}`}
          />
          <button
            onClick={() => updateWeight(weight + 2.5)}
            className="w-12 h-12 rounded-lg text-sm font-semibold bg-gray-200 dark:bg-surface-800 text-gray-700 dark:text-gray-300 active:scale-95 transition-all"
          >
            +2.5
          </button>
        </div>
        <AssistToggle assisted={assisted} onToggle={toggleAssisted} className="w-12" />
      </div>

      {/* Plate Calculator */}
      {weight > 45 && <PlateCalculator weight={weight} />}

      {/* Reps Input */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium w-14 shrink-0">Reps</span>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <button
            onClick={() => updateReps(reps - 1)}
            className="w-12 h-12 rounded-lg text-lg font-semibold bg-gray-200 dark:bg-surface-800 text-gray-700 dark:text-gray-300 active:scale-95 transition-all"
          >
            -1
          </button>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Number of reps"
            value={repsStr}
            onChange={(e) => handleRepsChange(e.target.value)}
            onBlur={handleRepsBlur}
            onFocus={(e) => e.target.select()}
            className="w-24 text-center text-2xl font-display font-bold border-2 border-gray-200 dark:border-surface-800 rounded-lg py-2 tabular-nums
                       bg-white dark:bg-surface-900 dark:text-white focus:border-primary-500 focus:ring-0 transition-colors"
          />
          <button
            onClick={() => updateReps(reps + 1)}
            className="w-12 h-12 rounded-lg text-lg font-semibold bg-gray-200 dark:bg-surface-800 text-gray-700 dark:text-gray-300 active:scale-95 transition-all"
          >
            +1
          </button>
        </div>
        <span className="w-12 shrink-0"></span>
      </div>

      {/* Log Button */}
      <button
        onClick={handleLog}
        disabled={isLogging}
        className="w-full py-4 min-h-[56px] rounded-lg font-display font-bold text-lg text-white
                   bg-gradient-to-b from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
                   active:scale-[0.97] transition-all shadow-sm
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLogging ? 'Logging...' : `Log Set ${setNumber}`}
      </button>
    </div>
  );
}
