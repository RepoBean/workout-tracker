import { useState } from 'react';
import { Button } from '../../../shared/ui/Button';
import { useProgramMutations } from '../hooks/usePrograms';
import { ExerciseForm } from './ExerciseForm';
import { CARDIO_MODALITY_INFO } from '../../../shared/api/cardio';
import type { Workout, Exercise } from '../../../shared/api/types';

const SUPERSET_COLORS: Record<string, string> = {
  A: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  B: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  C: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  D: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  E: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
};

// Target summary for an exercise row — cardio shows modality + duration/distance
// targets instead of the placeholder "1 × 1" sets/reps it stores.
function targetSummary(exercise: Exercise): string {
  if (exercise.exerciseType === 'cardio') {
    const parts: string[] = [CARDIO_MODALITY_INFO[exercise.cardioModality ?? 'other'].long];
    if (exercise.targetDurationSec) parts.push(`${Math.round(exercise.targetDurationSec / 60)} min`);
    if (exercise.targetDistance != null && exercise.targetDistance > 0) parts.push(`${exercise.targetDistance} mi`);
    return parts.join(' · ');
  }
  return `${exercise.targetSets} × ${exercise.targetReps}`;
}

interface WorkoutCardProps {
  workout: Workout;
  /** True when this workout is where the active program's rotation resumes. */
  isUpNext?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export function WorkoutCard({ workout, isUpNext, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: WorkoutCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(workout.name);
  const [exerciseFormState, setExerciseFormState] = useState<{
    open: boolean;
    exercise?: Exercise;
  }>({ open: false });

  const { updateWorkout, deleteWorkout, duplicateWorkout, reorderExercises } = useProgramMutations();
  const exercises = workout.exercises || [];

  const handleSaveName = () => {
    if (editName.trim() && editName.trim() !== workout.name) {
      updateWorkout.mutate({ id: workout.id, name: editName.trim() });
    }
    setIsEditingName(false);
  };

  const handleDelete = () => {
    if (confirm(`Delete workout "${workout.name}"? This will also delete all its exercises.`)) {
      deleteWorkout.mutate(workout.id);
    }
  };

  const handleMoveExercise = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= exercises.length) return;

    const reordered = [...exercises];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderExercises.mutate({
      workoutId: workout.id,
      exerciseIds: reordered.map(e => e.id),
    });
  };

  const metaLine = exercises.length === 0
    ? 'No exercises yet'
    : `${exercises.length} exercise${exercises.length !== 1 ? 's' : ''} · ${exercises.map(e => e.name).join(', ')}`;

  return (
    <div className="border dark:border-surface-700 rounded-lg overflow-hidden">
      {/* Workout Header — name and meta stack so the name gets the full width */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-surface-800 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <input
              className="w-full px-2 py-0.5 text-sm border rounded dark:bg-surface-900 dark:border-surface-800"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') {
                  setEditName(workout.name);
                  setIsEditingName(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="font-semibold text-sm truncate"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditName(workout.name);
                  setIsEditingName(true);
                }}
              >
                {workout.name}
              </span>
              {isUpNext && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-primary-100 text-primary-700 dark:bg-primary-900/60 dark:text-primary-300 flex-shrink-0">
                  Up next
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {metaLine}
          </p>
        </div>

        {onMoveUp && onMoveDown && (
          <>
            <button
              className="p-2 min-w-[40px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:hover:text-gray-400 flex-shrink-0"
              disabled={!canMoveUp}
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              title="Move up"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              className="p-2 min-w-[40px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:hover:text-gray-400 flex-shrink-0"
              disabled={!canMoveDown}
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              title="Move down"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 py-2">
          {exercises.length === 0 && (
            <p className="text-sm text-gray-500 py-2">No exercises yet</p>
          )}

          <div className="space-y-0.5">
            {exercises.map((exercise, index) => (
              <div
                key={exercise.id}
                className="flex items-center gap-1 border-b dark:border-surface-700 last:border-0"
              >
                {/* Whole row is the tap-to-edit target (pencil hint at row end) */}
                <button
                  className="flex-1 min-w-0 flex items-center gap-2 py-1.5 min-h-[44px] text-left"
                  onClick={() => setExerciseFormState({ open: true, exercise })}
                  title="Edit exercise"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium truncate">{exercise.name}</span>
                      {exercise.supersetGroup && (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${SUPERSET_COLORS[exercise.supersetGroup] || ''}`}>
                          {exercise.supersetGroup}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {targetSummary(exercise)}
                    </span>
                  </div>
                  <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>

                {/* Compact reorder */}
                <button
                  className="p-2 min-w-[40px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:hover:text-gray-400 flex-shrink-0"
                  disabled={index === 0}
                  onClick={() => handleMoveExercise(index, 'up')}
                  title="Move up"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  className="p-2 min-w-[40px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:hover:text-gray-400 flex-shrink-0"
                  disabled={index === exercises.length - 1}
                  onClick={() => handleMoveExercise(index, 'down')}
                  title="Move down"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExerciseFormState({ open: true })}
            className="w-full mt-2"
          >
            + Add Exercise
          </Button>

          {/* Workout-level actions — out of the header so the name keeps its room */}
          <div className="flex justify-end gap-1 mt-1 pt-1 border-t border-gray-100 dark:border-white/[0.06]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => duplicateWorkout.mutate(workout.id)}
              disabled={duplicateWorkout.isPending}
              className="text-gray-500 dark:text-gray-400"
            >
              Duplicate workout
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteWorkout.isPending}
              className="text-red-600 dark:text-red-400"
            >
              Delete workout
            </Button>
          </div>
        </div>
      )}

      {/* Exercise Form Modal */}
      {exerciseFormState.open && (
        <ExerciseForm
          workoutId={workout.id}
          exercise={exerciseFormState.exercise}
          orderIndex={exercises.length}
          onClose={() => setExerciseFormState({ open: false })}
          existingSupersetGroups={exercises
            .map(e => e.supersetGroup)
            .filter((g): g is string => g !== null)}
        />
      )}
    </div>
  );
}
