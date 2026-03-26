import { useState } from 'react';
import { Button } from '../../../shared/ui/Button';
import { useProgramMutations } from '../hooks/usePrograms';
import { ExerciseForm } from './ExerciseForm';
import type { Workout, Exercise } from '../../../shared/api/types';

const SUPERSET_COLORS: Record<string, string> = {
  A: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  B: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  C: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  D: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  E: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
};

interface WorkoutCardProps {
  workout: Workout;
}

export function WorkoutCard({ workout }: WorkoutCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(workout.name);
  const [exerciseFormState, setExerciseFormState] = useState<{
    open: boolean;
    exercise?: Exercise;
  }>({ open: false });

  const { updateWorkout, deleteWorkout, duplicateWorkout, deleteExercise, reorderExercises } = useProgramMutations();
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

  const handleDeleteExercise = (exercise: Exercise) => {
    if (confirm(`Delete exercise "${exercise.name}"?`)) {
      deleteExercise.mutate(exercise.id);
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

  return (
    <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Workout Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {isEditingName ? (
            <input
              className="flex-1 px-2 py-0.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
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
            <span
              className="font-medium text-sm truncate"
              onClick={(e) => {
                e.stopPropagation();
                setEditName(workout.name);
                setIsEditingName(true);
              }}
            >
              {workout.name}
            </span>
          )}

          <span className="text-xs text-gray-500 flex-shrink-0">
            {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
          </span>
        </div>

        <button
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-primary-600 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            duplicateWorkout.mutate(workout.id);
          }}
          title="Duplicate workout"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-red-500 hover:text-red-700 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          title="Delete workout"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 py-2 space-y-1">
          {exercises.length === 0 && (
            <p className="text-sm text-gray-500 py-2">No exercises yet</p>
          )}

          {exercises.map((exercise, index) => (
            <div
              key={exercise.id}
              className="flex items-center gap-2 py-1.5 border-b dark:border-gray-700 last:border-0"
            >
              {/* Reorder buttons */}
              <div className="flex flex-col flex-shrink-0">
                <button
                  className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => handleMoveExercise(index, 'up')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  disabled={index === exercises.length - 1}
                  onClick={() => handleMoveExercise(index, 'down')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Exercise info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{exercise.name}</span>
                  {exercise.supersetGroup && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SUPERSET_COLORS[exercise.supersetGroup] || ''}`}>
                      {exercise.supersetGroup}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {exercise.targetSets} x {exercise.targetReps}
                </span>
              </div>

              {/* Edit / Delete */}
              <button
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-primary-600"
                onClick={() => setExerciseFormState({ open: true, exercise })}
                title="Edit exercise"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-600"
                onClick={() => handleDeleteExercise(exercise)}
                title="Delete exercise"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExerciseFormState({ open: true })}
            className="w-full mt-2"
          >
            + Add Exercise
          </Button>
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
