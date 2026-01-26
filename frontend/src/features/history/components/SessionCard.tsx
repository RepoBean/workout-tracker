import { useState, useMemo } from 'react';
import type { Session, Set } from '../../../shared/api/types';

interface SessionCardProps {
  session: Session;
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

interface ExerciseGroup {
  name: string;
  sets: Set[];
}

export function SessionCard({ session }: SessionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const stats = useMemo(() => {
    const sets = session.sets || [];
    const exerciseNames = new globalThis.Set(sets.map(s => s.exerciseName));
    const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    return {
      exerciseCount: exerciseNames.size,
      setCount: sets.length,
      totalVolume,
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
      <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span>{stats.exerciseCount} exercise{stats.exerciseCount !== 1 ? 's' : ''}</span>
        <span>{stats.setCount} set{stats.setCount !== 1 ? 's' : ''}</span>
        <span>{stats.totalVolume.toLocaleString()} lbs volume</span>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t dark:border-gray-700 space-y-3">
          {exerciseGroups.map((group) => (
            <div key={group.name}>
              <div className="text-sm font-medium mb-1">{group.name}</div>
              <div className="space-y-0.5">
                {group.sets.map((set) => (
                  <div
                    key={set.id}
                    className={`text-xs flex items-center gap-2 ${
                      set.dropIndex > 0 ? 'ml-4 text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <span className="w-12">
                      {set.dropIndex > 0 ? `Drop ${set.dropIndex}` : `Set ${set.setNumber}`}
                    </span>
                    <span>{set.weight} lbs x {set.reps}</span>
                    {set.perceivedEffort && (
                      <span className="text-gray-400">RPE {set.perceivedEffort}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
