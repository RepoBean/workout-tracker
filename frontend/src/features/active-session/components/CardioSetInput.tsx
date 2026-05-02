import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useHeartRate } from '../../../shared/context/HeartRateContext';
import { useUserProfile } from '../../../shared/context/UserProfileContext';
import { estimateMaxHr, getZone } from '../../../shared/lib/hrZones';
import { formatMMSS } from '../../../shared/utils/format';

interface CardioSetInputProps {
  exerciseId: number | null;
  exerciseName: string;
  setNumber: number;
  targetDurationSec?: number | null;
  targetDistance?: number | null;
  onLogSet: (data: {
    exerciseId: number | null;
    exerciseName: string;
    weight: number;
    reps: number;
    setNumber: number;
    durationSec?: number | null;
    distance?: number | null;
  }) => void;
  isLogging?: boolean;
}

type Phase = 'idle' | 'running' | 'finishing';

const formatTarget = (sec: number): string => {
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60} min`;
  return formatMMSS(sec);
};

/**
 * Storage key prefix for in-progress cardio state, scoped per session.
 * Used by the session completion handler to scan-and-clear all cardio
 * state for the session.
 */
export function getCardioStorageKeyPrefix(sessionId: number): string {
  return `wt:cardio:${sessionId}:`;
}

/**
 * Build a stable storage key for a cardio set in progress.
 * Program exercises use their stable id; ad-hoc exercises (negative id,
 * regenerated per page load via -Date.now()) fall back to the exercise name.
 */
function getCardioStorageKey(
  sessionId: number,
  exerciseId: number | null,
  exerciseName: string,
  setNumber: number
): string {
  const identity =
    exerciseId !== null && exerciseId > 0
      ? `id-${exerciseId}`
      : `name-${exerciseName.toLowerCase()}`;
  return `${getCardioStorageKeyPrefix(sessionId)}${identity}:${setNumber}`;
}

interface PersistedCardioState {
  startedAt: number;
  phase: 'running' | 'finishing';
  distanceStr?: string;
}

export function CardioSetInput({
  exerciseId,
  exerciseName,
  setNumber,
  targetDurationSec,
  targetDistance,
  onLogSet,
  isLogging = false,
}: CardioSetInputProps) {
  const heartRate = useHeartRate();
  const { profile } = useUserProfile();
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);

  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [distanceStr, setDistanceStr] = useState('');
  const startedAtRef = useRef<number | null>(null);
  const hasRestoredRef = useRef(false);

  const storageKey = Number.isFinite(sessionId)
    ? getCardioStorageKey(sessionId, exerciseId, exerciseName, setNumber)
    : null;

  // Restore in-progress cardio state from localStorage on mount.
  // Survives navigation (dropdown, dashboard) and mobile tab eviction.
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedCardioState;
      if (typeof parsed?.startedAt !== 'number') return;
      if (parsed.phase !== 'running' && parsed.phase !== 'finishing') return;
      startedAtRef.current = parsed.startedAt;
      setElapsedSec(Math.max(0, Math.floor((Date.now() - parsed.startedAt) / 1000)));
      if (typeof parsed.distanceStr === 'string') setDistanceStr(parsed.distanceStr);
      setPhase(parsed.phase);
    } catch {
      // ignore parse / quota errors — fall back to fresh idle state
    }
  }, [storageKey]);

  // Persist whenever in-progress state changes. Skip while idle.
  useEffect(() => {
    if (!storageKey) return;
    if (phase === 'idle' || startedAtRef.current === null) return;
    try {
      const payload: PersistedCardioState = {
        startedAt: startedAtRef.current,
        phase,
        ...(distanceStr ? { distanceStr } : {}),
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore quota errors
    }
  }, [storageKey, phase, distanceStr, elapsedSec]);

  // Tick the elapsed counter while running, drift-corrected against Date.now()
  useEffect(() => {
    if (phase !== 'running' || startedAtRef.current === null) return;
    const interval = setInterval(() => {
      if (startedAtRef.current === null) return;
      setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 250);
    return () => clearInterval(interval);
  }, [phase]);

  const handleStart = useCallback(() => {
    startedAtRef.current = Date.now();
    setElapsedSec(0);
    setPhase('running');
  }, []);

  const handleFinish = useCallback(() => {
    if (startedAtRef.current !== null) {
      setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }
    setPhase('finishing');
  }, []);

  const handleSave = useCallback(() => {
    const durationSec = Math.max(1, elapsedSec);
    const parsed = parseFloat(distanceStr);
    const distance = !isNaN(parsed) && parsed > 0 ? parsed : null;
    onLogSet({
      exerciseId,
      exerciseName,
      weight: 0,
      reps: 0,
      setNumber,
      durationSec,
      distance,
    });
    // Clear persisted state once the set has been handed off to the API.
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore quota errors
      }
    }
  }, [elapsedSec, distanceStr, onLogSet, exerciseId, exerciseName, setNumber, storageKey]);

  const handleResume = useCallback(() => {
    if (startedAtRef.current !== null) {
      setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }
    setPhase('running');
  }, []);

  // ----- Idle -----
  if (phase === 'idle') {
    const targetParts: string[] = [];
    if (targetDurationSec) targetParts.push(`${formatTarget(targetDurationSec)}`);
    if (targetDistance) targetParts.push(`${targetDistance} mi`);

    return (
      <div className="rounded-card p-4 space-y-4 bg-surface-100 dark:bg-surface-850">
        {targetParts.length > 0 && (
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Target</div>
            <div className="text-2xl font-display font-bold text-gray-700 dark:text-gray-200 tabular-nums mt-1">
              {targetParts.join(' • ')}
            </div>
          </div>
        )}
        <button
          onClick={handleStart}
          disabled={isLogging}
          className="w-full py-5 min-h-[64px] rounded-lg font-display font-bold text-lg text-white
                     bg-gradient-to-b from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
                     active:scale-[0.97] transition-all shadow-sm
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start
        </button>
      </div>
    );
  }

  // ----- Running -----
  if (phase === 'running') {
    return (
      <div className="rounded-card p-4 space-y-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
        <div className="text-center">
          <div className="text-xs text-primary-600 dark:text-primary-400 uppercase tracking-wide font-semibold">
            Elapsed
          </div>
          <div className="text-5xl font-display font-bold text-primary-700 dark:text-primary-300 tabular-nums mt-1">
            {formatMMSS(elapsedSec)}
          </div>
          {targetDurationSec && (
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              of {formatTarget(targetDurationSec)} target
            </div>
          )}
        </div>

        {heartRate.isConnected && (() => {
          const bpm = heartRate.currentBpm;
          const hasZoneMath = bpm != null && estimateMaxHr(profile) != null;
          const zoneResult = hasZoneMath ? getZone(bpm, profile) : null;
          const colorClass = zoneResult?.colorClass ?? 'text-red-600 dark:text-red-400';
          return (
            <div className={`flex items-center justify-center gap-2 ${colorClass}`}>
              <svg className="w-4 h-4 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span className="font-semibold tabular-nums">{bpm ?? '—'} BPM</span>
              {zoneResult && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded border border-current/40">
                  {zoneResult.name}
                </span>
              )}
            </div>
          );
        })()}

        <button
          onClick={handleFinish}
          className="w-full py-4 min-h-[56px] rounded-lg font-display font-bold text-lg text-white
                     bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700
                     active:scale-[0.97] transition-all shadow-sm"
        >
          Finish
        </button>
      </div>
    );
  }

  // ----- Finishing -----
  return (
    <div className="rounded-card p-4 space-y-4 bg-surface-100 dark:bg-surface-850">
      <div className="text-center">
        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Duration</div>
        <div className="text-3xl font-display font-bold text-gray-800 dark:text-gray-100 tabular-nums mt-1">
          {formatMMSS(elapsedSec)}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium w-20 shrink-0">Distance</span>
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          aria-label="Distance in miles"
          value={distanceStr}
          onChange={(e) => setDistanceStr(e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="optional"
          className="flex-1 text-center text-2xl font-display font-bold border-2 border-gray-200 dark:border-surface-800 rounded-lg py-2 tabular-nums
                     bg-white dark:bg-surface-900 dark:text-white focus:border-primary-500 focus:ring-0 transition-colors
                     placeholder:text-base placeholder:font-normal placeholder:text-gray-400"
        />
        <span className="text-sm text-gray-400 dark:text-gray-500 w-8 shrink-0">mi</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleResume}
          disabled={isLogging}
          className="flex-1 py-3 min-h-[48px] rounded-lg font-medium text-gray-700 dark:text-gray-200
                     bg-gray-200 dark:bg-surface-800 active:scale-[0.97] transition-all
                     disabled:opacity-50"
        >
          Resume
        </button>
        <button
          onClick={handleSave}
          disabled={isLogging}
          className="flex-[2] py-3 min-h-[48px] rounded-lg font-display font-bold text-lg text-white
                     bg-gradient-to-b from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
                     active:scale-[0.97] transition-all shadow-sm
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLogging ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
