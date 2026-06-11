import { useState } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
import { useExerciseSuggestions } from '../../../shared/api/queries';
import { useProgramMutations } from '../hooks/usePrograms';
import { CARDIO_MODALITY_OPTIONS } from '../../../shared/api/cardio';
import type { CardioModality, Exercise, ExerciseType } from '../../../shared/api/types';

const ALL_GROUPS = ['A', 'B', 'C', 'D', 'E'] as const;

interface ExerciseFormProps {
  workoutId: number;
  exercise?: Exercise;
  orderIndex: number;
  onClose: () => void;
  existingSupersetGroups: string[];
}

export function ExerciseForm({ workoutId, exercise, orderIndex, onClose, existingSupersetGroups }: ExerciseFormProps) {
  const [name, setName] = useState(exercise?.name || '');
  const [exerciseType, setExerciseType] = useState<ExerciseType>(exercise?.exerciseType || 'strength');
  const [targetSets, setTargetSets] = useState(exercise?.targetSets?.toString() || '3');
  const [targetReps, setTargetReps] = useState(exercise?.targetReps || '10');
  const [supersetGroup, setSupersetGroup] = useState<string>(exercise?.supersetGroup || '');
  const [cardioModality, setCardioModality] = useState<CardioModality>(exercise?.cardioModality || 'running');
  const [targetDurationMin, setTargetDurationMin] = useState(
    exercise?.targetDurationSec ? String(Math.round(exercise.targetDurationSec / 60)) : ''
  );
  const [targetDistance, setTargetDistance] = useState(
    exercise?.targetDistance != null ? String(exercise.targetDistance) : ''
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [nextOrderIndex, setNextOrderIndex] = useState(orderIndex);

  const { createExercise, updateExercise } = useProgramMutations();
  const { data: suggestions } = useExerciseSuggestions(name);

  const isEditing = !!exercise;
  const isSubmitting = createExercise.isPending || updateExercise.isPending;
  const isCardio = exerciseType === 'cardio';

  // Dynamic superset group logic
  const usedGroups = [...new Set(existingSupersetGroups)].sort();
  const nextAvailableGroup = ALL_GROUPS.find(g => !usedGroups.includes(g));
  const displayGroups = [...usedGroups];
  if (supersetGroup && !displayGroups.includes(supersetGroup)) {
    displayGroups.push(supersetGroup);
    displayGroups.sort();
  }

  const handleSubmit = (action: 'close' | 'next') => {
    if (!name.trim()) return;

    if (isCardio) {
      const durationMin = targetDurationMin ? parseFloat(targetDurationMin) : NaN;
      const distance = targetDistance ? parseFloat(targetDistance) : NaN;
      const hasDuration = !isNaN(durationMin) && durationMin > 0;
      const hasDistance = !isNaN(distance) && distance > 0;
      if (!hasDuration && !hasDistance) return;

      const cardioPayload = {
        name: name.trim(),
        targetSets: 1,
        targetReps: '1',
        supersetGroup: null,
        exerciseType: 'cardio' as const,
        cardioModality,
        targetDurationSec: hasDuration ? Math.round(durationMin * 60) : null,
        targetDistance: hasDistance ? distance : null,
      };

      if (isEditing) {
        updateExercise.mutate({ id: exercise.id, ...cardioPayload }, { onSuccess: onClose });
      } else {
        createExercise.mutate({
          workoutId,
          orderIndex: nextOrderIndex,
          ...cardioPayload,
        }, {
          onSuccess: () => {
            if (action === 'close') {
              onClose();
            } else {
              setName('');
              setTargetDurationMin('');
              setTargetDistance('');
              setNextOrderIndex(prev => prev + 1);
            }
          }
        });
      }
      return;
    }

    const setsNum = parseInt(targetSets);
    if (isNaN(setsNum) || setsNum < 1 || !targetReps.trim()) return;

    const group = supersetGroup || null;

    if (isEditing) {
      updateExercise.mutate({
        id: exercise.id,
        name: name.trim(),
        targetSets: setsNum,
        targetReps: targetReps.trim(),
        supersetGroup: group,
        exerciseType: 'strength',
        cardioModality: null,
        targetDurationSec: null,
        targetDistance: null,
      }, { onSuccess: onClose });
    } else {
      createExercise.mutate({
        workoutId,
        name: name.trim(),
        targetSets: setsNum,
        targetReps: targetReps.trim(),
        orderIndex: nextOrderIndex,
        supersetGroup: group,
        exerciseType: 'strength',
      }, {
        onSuccess: () => {
          if (action === 'close') {
            onClose();
          } else {
            setName('');
            setTargetSets('3');
            setTargetReps('10');
            setSupersetGroup('');
            setNextOrderIndex(prev => prev + 1);
          }
        }
      });
    }
  };

  const filteredSuggestions = suggestions?.filter(s =>
    s.toLowerCase() !== name.toLowerCase()
  ) || [];

  return (
    <Modal isOpen onClose={onClose} title={isEditing ? 'Edit Exercise' : 'Add Exercise'}>
      <div className="space-y-5">
        {/* Type toggle — slim segmented control */}
        <div className="inline-flex w-full p-0.5 rounded-lg bg-gray-100 dark:bg-surface-900">
          <button
            type="button"
            onClick={() => setExerciseType('strength')}
            className={`flex-1 h-9 rounded-md text-sm font-medium transition-colors ${exerciseType === 'strength'
              ? 'bg-white dark:bg-surface-800 text-primary-700 dark:text-primary-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
          >
            Strength
          </button>
          <button
            type="button"
            onClick={() => setExerciseType('cardio')}
            className={`flex-1 h-9 rounded-md text-sm font-medium transition-colors ${exerciseType === 'cardio'
              ? 'bg-white dark:bg-surface-800 text-primary-700 dark:text-primary-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
          >
            Cardio
          </button>
        </div>

        <div className="relative">
          <Input
            label="Exercise Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="e.g. Bench Press"
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-surface-800 border dark:border-surface-700 rounded-lg shadow-lg max-h-48 overflow-auto">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-surface-600 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setName(suggestion);
                    setShowSuggestions(false);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {!isCardio && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Target Sets"
              type="number"
              value={targetSets}
              onChange={(e) => setTargetSets(e.target.value)}
              min={1}
            />
            <Input
              label="Target Reps"
              value={targetReps}
              onChange={(e) => setTargetReps(e.target.value)}
              placeholder="e.g. 8-10"
            />
          </div>
        )}

        {isCardio && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Modality
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {CARDIO_MODALITY_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCardioModality(value)}
                    className={`px-2.5 py-1.5 rounded text-sm font-medium transition-colors ${
                      cardioModality === value
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-200 dark:bg-surface-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-surface-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Target Duration (min)"
                type="number"
                value={targetDurationMin}
                onChange={(e) => setTargetDurationMin(e.target.value)}
                placeholder="e.g. 30"
                min={1}
              />
              <Input
                label="Target Distance (mi)"
                type="number"
                value={targetDistance}
                onChange={(e) => setTargetDistance(e.target.value)}
                placeholder="e.g. 3"
                step="0.1"
                min={0}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              At least one of duration or distance is required.
            </p>
          </div>
        )}

        {!isCardio && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Superset Group
          </label>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setSupersetGroup('')}
              className={`px-2.5 py-1.5 rounded text-sm font-medium transition-colors ${
                supersetGroup === ''
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-surface-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-surface-600'
              }`}
            >
              None
            </button>

            {displayGroups.map((group) => (
              <button
                key={group}
                onClick={() => setSupersetGroup(group)}
                className={`px-2.5 py-1.5 rounded text-sm font-medium transition-colors ${
                  supersetGroup === group
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 dark:bg-surface-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-surface-600'
                }`}
              >
                {group}
              </button>
            ))}

            {nextAvailableGroup && (
              <button
                onClick={() => setSupersetGroup(nextAvailableGroup)}
                className="px-2.5 py-1.5 rounded text-sm font-medium transition-colors bg-gray-200 dark:bg-surface-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-surface-600"
              >
                + New Group
              </button>
            )}
          </div>
        </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
          {isEditing ? (
            <>
              <Button onClick={() => handleSubmit('close')} disabled={!name.trim() || isSubmitting} className="w-full sm:w-auto">
                Save
              </Button>
              <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => handleSubmit('next')} disabled={!name.trim() || isSubmitting} className="w-full sm:w-auto">
                Add & Next
              </Button>
              <Button variant="secondary" onClick={() => handleSubmit('close')} disabled={!name.trim() || isSubmitting} className="w-full sm:w-auto">
                Add & Close
              </Button>
              <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
