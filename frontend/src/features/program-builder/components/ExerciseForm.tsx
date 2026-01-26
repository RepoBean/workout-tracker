import { useState } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
import { useExerciseSuggestions } from '../../../shared/api/queries';
import { useProgramMutations } from '../hooks/usePrograms';
import type { Exercise } from '../../../shared/api/types';

interface ExerciseFormProps {
  workoutId: number;
  exercise?: Exercise;
  orderIndex: number;
  onClose: () => void;
}

export function ExerciseForm({ workoutId, exercise, orderIndex, onClose }: ExerciseFormProps) {
  const [name, setName] = useState(exercise?.name || '');
  const [targetSets, setTargetSets] = useState(exercise?.targetSets?.toString() || '3');
  const [targetReps, setTargetReps] = useState(exercise?.targetReps || '10');
  const [supersetGroup, setSupersetGroup] = useState<string>(exercise?.supersetGroup || '');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { createExercise, updateExercise } = useProgramMutations();
  const { data: suggestions } = useExerciseSuggestions(name);

  const isEditing = !!exercise;
  const isSubmitting = createExercise.isPending || updateExercise.isPending;

  const handleSubmit = () => {
    const setsNum = parseInt(targetSets);
    if (!name.trim() || isNaN(setsNum) || setsNum < 1 || !targetReps.trim()) return;

    const group = supersetGroup || null;

    if (isEditing) {
      updateExercise.mutate({
        id: exercise.id,
        name: name.trim(),
        targetSets: setsNum,
        targetReps: targetReps.trim(),
        supersetGroup: group,
      }, { onSuccess: onClose });
    } else {
      createExercise.mutate({
        workoutId,
        name: name.trim(),
        targetSets: setsNum,
        targetReps: targetReps.trim(),
        orderIndex,
        supersetGroup: group,
      }, { onSuccess: onClose });
    }
  };

  const filteredSuggestions = suggestions?.filter(s =>
    s.toLowerCase() !== name.toLowerCase()
  ) || [];

  return (
    <Modal isOpen onClose={onClose} title={isEditing ? 'Edit Exercise' : 'Add Exercise'}>
      <div className="space-y-4">
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
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg max-h-32 overflow-auto">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
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

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Superset Group
          </label>
          <div className="flex gap-2">
            {['', 'A', 'B', 'C', 'D', 'E'].map((group) => (
              <button
                key={group}
                onClick={() => setSupersetGroup(group)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  supersetGroup === group
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {group || 'None'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={!name.trim() || isSubmitting}>
            {isEditing ? 'Save' : 'Add Exercise'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
