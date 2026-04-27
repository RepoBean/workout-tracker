import { useState, useMemo, useRef, useEffect } from 'react';
import type { Session, Set } from '../../../shared/api/types';
import { isCardioSet } from '../../../shared/api/predicates';
import { parseSeries } from '../../../shared/utils/heartRate';
import { SessionHRChart } from './SessionHRChart';

interface SessionCardProps {
  session: Session;
  highlightId?: string | null;
  onDelete?: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDuration(createdAt: string, completedAt: string | null): string {
  if (!completedAt) return '';
  const start = new Date(createdAt).getTime();
  const end = new Date(completedAt).getTime();
  const minutes = Math.round((end - start) / (1000 * 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatSetSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface ExerciseGroup {
  name: string;
  sets: Set[];
}

export function SessionCard({ session, highlightId, onDelete }: SessionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const confirmTimeoutRef = useRef<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(
    highlightId ? session.id === Number(highlightId) : false
  );
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (highlightId && session.id === Number(highlightId) && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [highlightId, session.id]);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  const stats = useMemo(() => {
    const sets = session.sets || [];
    const exerciseNames = new globalThis.Set(sets.map(s => s.exerciseName));
    // Volume only includes strength sets (cardio has weight=reps=0)
    const totalVolume = sets
      .filter(s => !isCardioSet(s))
      .reduce((sum, s) => sum + s.weight * s.reps, 0);
    const cardioSeconds = sets
      .filter(isCardioSet)
      .reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
    const cardioDistance = sets
      .filter(isCardioSet)
      .reduce((sum, s) => sum + (s.distance ?? 0), 0);
    return {
      exerciseCount: exerciseNames.size,
      setCount: sets.length,
      totalVolume,
      cardioSeconds,
      cardioDistance,
    };
  }, [session.sets]);

  const exerciseGroups = useMemo((): ExerciseGroup[] => {
    const sets = session.sets || [];
    const groups: Map<string, Set[]> = new Map();
    const order: string[] = [];

    for (const set of sets) {
      if (!groups.has(set.exerciseName)) {
        groups.set(set.exerciseName, []);
        order.push(set.exerciseName);
      }
      groups.get(set.exerciseName)!.push(set);
    }

    return order.map(name => ({
      name,
      sets: groups.get(name)!.sort((a, b) => {
        if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber;
        return a.dropIndex - b.dropIndex;
      }),
    }));
  }, [session.sets]);

  const duration = formatDuration(session.createdAt, session.completedAt);

  return (
    <div
      ref={cardRef}
      className="card cursor-pointer"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Summary Row */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{session.workoutName}</span>
            {session.isAdHoc && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                Ad-hoc
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {session.programName}
          </div>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <div className="text-sm font-medium">
            {session.completedAt ? formatDate(session.completedAt) : 'In Progress'}
          </div>
          {duration && (
            <div className="text-xs text-gray-500">{duration}</div>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        <span>{stats.exerciseCount} exercise{stats.exerciseCount !== 1 ? 's' : ''}</span>
        <span>{stats.setCount} set{stats.setCount !== 1 ? 's' : ''}</span>
        {stats.totalVolume > 0 && (
          <span>{stats.totalVolume.toLocaleString()} lbs volume</span>
        )}
        {stats.cardioSeconds > 0 && (
          <span>{Math.round(stats.cardioSeconds / 60)} min cardio</span>
        )}
        {stats.cardioDistance > 0 && (
          <span>{stats.cardioDistance.toFixed(2)} mi</span>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t dark:border-gray-700 space-y-3">
          {(() => {
            const parsed = parseSeries(session.heartRateSeries);
            if (!parsed) return null;
            const sessionStartMs = new Date(session.createdAt).getTime();
            const setMarkers = (session.sets ?? []).map((s) => ({
              t: Math.max(0, Math.round((new Date(s.createdAt).getTime() - sessionStartMs) / 1000)),
              label: `Set ${s.setNumber}`,
            }));
            const hasCardio = (session.sets ?? []).some(isCardioSet);
            return (
              <SessionHRChart
                series={parsed}
                setMarkers={setMarkers}
                mode={hasCardio ? 'continuous' : 'interval'}
              />
            );
          })()}
          {exerciseGroups.map((group) => (
            <div key={group.name}>
              <div className="text-sm font-medium mb-1">{group.name}</div>
              <div className="space-y-0.5">
                {group.sets.map((set) => {
                  const cardio = isCardioSet(set);
                  return (
                    <div
                      key={set.id}
                      className={`text-xs flex items-center gap-2 ${set.dropIndex > 0 ? 'ml-4 text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'
                        }`}
                    >
                      <span className="w-12">
                        {set.dropIndex > 0 ? `Drop ${set.dropIndex}` : `Set ${set.setNumber}`}
                      </span>
                      {cardio ? (
                        <span>
                          {set.durationSec ? formatSetSec(set.durationSec) : '—'}
                          {set.distance != null && set.distance > 0 && (
                            <span> · {set.distance} mi</span>
                          )}
                        </span>
                      ) : (
                        <span>{set.weight} lbs x {set.reps}</span>
                      )}
                      {set.perceivedEffort && (
                        <span className="text-gray-400">RPE {set.perceivedEffort}</span>
                      )}
                      {set.heartRateAvg != null && (
                        <span className="text-red-500 dark:text-red-400">♥ {set.heartRateAvg}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isConfirmingDelete) {
                  onDelete();
                } else {
                  setIsConfirmingDelete(true);
                  confirmTimeoutRef.current = window.setTimeout(() => {
                    setIsConfirmingDelete(false);
                  }, 3000);
                }
              }}
              className={`w-full mt-2 py-2 text-sm rounded-lg transition-colors ${
                isConfirmingDelete
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium'
                  : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
              }`}
            >
              {isConfirmingDelete ? 'Tap again to confirm' : 'Delete Session'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
