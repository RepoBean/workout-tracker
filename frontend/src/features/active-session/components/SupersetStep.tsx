import type { ReactNode } from 'react';
import { isCardioExercise } from '../../../shared/api/predicates';
import type { Exercise } from '../../../shared/api/types';

interface SupersetStepProps {
  exercises: Exercise[];
  group: string;
  /** Raw supersetActiveIndex from navigation (may exceed exercises.length) */
  activeIndex: number;
  isExerciseComplete: (exerciseId: number) => boolean;
  getExerciseProgress: (exerciseId: number) => { logged: number; target: number };
  /** Activate the exercise at this index (collapsed-card tap) */
  onActivate: (index: number) => void;
  renderExerciseCard: (exercise: Exercise) => ReactNode;
}

/**
 * Superset step with fixed card positions. Cards stay in program order;
 * the active exercise expands in place while the others collapse.
 * Rotation (which exercise becomes active after logging a set) is owned
 * by useExerciseNavigation — this component only renders and activates.
 */
export function SupersetStep({
  exercises,
  group,
  activeIndex,
  isExerciseComplete,
  getExerciseProgress,
  onActivate,
  renderExerciseCard,
}: SupersetStepProps) {
  const activeIdx = activeIndex % exercises.length;

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-purple-600 dark:text-purple-400
                   px-3 py-1 bg-purple-100 dark:bg-purple-900/30 rounded-lg inline-block">
        Superset {group}
      </div>
      {exercises.map((exercise, idx) => {
        const isActive = idx === activeIdx;
        const isComplete = isExerciseComplete(exercise.id);

        if (isActive) {
          return (
            <div key={exercise.id} className="transition-all">
              {renderExerciseCard(exercise)}
            </div>
          );
        }

        const progress = getExerciseProgress(exercise.id);
        const unit = isCardioExercise(exercise) ? 'effort' : 'sets';

        return (
          <div
            key={exercise.id}
            className={`transition-all ${isComplete ? 'opacity-60 scale-[0.98]' : 'opacity-75'}`}
          >
            {/* Collapsed view — tap to make this exercise active */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => onActivate(idx)}
              onKeyDown={(e) => { if (e.key === 'Enter') onActivate(idx); }}
              className={`card py-3 px-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-700
                         ${isComplete ? 'ring-2 ring-green-500 dark:ring-green-400' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{exercise.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {progress.logged}/{progress.target} {unit}
                  </p>
                </div>
                {isComplete && (
                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
