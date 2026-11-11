import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
import { useToast } from '../../../shared/ui/Toast';
import { api } from '../../../shared/api/client';
import { queryKeys, useExerciseAllSets } from '../../../shared/api/queries';
import type { Exercise } from '../../../shared/api/types';
import { formatWeight } from '../../../shared/utils/format';
import { historyFromSets, learnedStep, type ProgressionResult } from '../logic/progression';

const PRESETS = [2.5, 5, 10];

interface ProgressionChipProps {
  exercise: Exercise;
  result: ProgressionResult;
  /** The step in effect: the slot's own, else the global one. */
  step: number;
  globalStep: number;
}

/**
 * The progression hint above the set input. On a program exercise it is a button: tap to set
 * that slot's weight step right at the machine. Virtual (ad-hoc / swap) exercises have no slot
 * to save to, so theirs is plain text on the global step.
 */
export function ProgressionChip({ exercise, result, step, globalStep }: ProgressionChipProps) {
  const [open, setOpen] = useState(false);
  const canEdit = exercise.id > 0;
  const tone =
    result.kind === 'up'
      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
      : result.kind === 'deload'
        ? 'bg-accent-100 dark:bg-accent-900/30 text-accent-800 dark:text-accent-300'
        : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-400';
  const body = (
    <>
      {result.kind === 'up' && <span aria-hidden>📈</span>}
      <span className="flex-1 text-left">{result.reason}</span>
    </>
  );
  const base = `mb-2 w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${tone}`;

  if (!canEdit) return <div className={base}>{body}</div>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${base} min-h-[44px]`}
        aria-label={`${result.reason}. Weight step ${formatWeight(step)} lb, tap to change`}
      >
        {body}
        <span className="shrink-0 rounded-md border border-current/30 px-1.5 py-0.5 text-xs opacity-80">
          +{formatWeight(step)} ▾
        </span>
      </button>
      {open && (
        <StepPickerModal exercise={exercise} step={step} globalStep={globalStep} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

interface StepPickerModalProps {
  exercise: Exercise;
  step: number;
  globalStep: number;
  onClose: () => void;
}

function StepPickerModal({ exercise, step, globalStep, onClose }: StepPickerModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [custom, setCustom] = useState('');

  // The lift's own jumps so far — fetched only while the picker is open (same cache entry as
  // the PR check and the deload hint).
  const { data: allSets } = useExerciseAllSets(exercise.name, true);
  const learned = useMemo(
    () => (allSets ? learnedStep(historyFromSets(allSets.sets)) : null),
    [allSets],
  );

  const save = useMutation({
    // The PUT always carries the whole exercise, never the step alone: an older backend strips
    // incrementLbs and would 400 a body left empty (see ExerciseForm).
    mutationFn: async (incrementLbs: number | null) => {
      await api.put(`/exercises/${exercise.id}`, {
        name: exercise.name,
        targetSets: exercise.targetSets,
        targetReps: exercise.targetReps,
        supersetGroup: exercise.supersetGroup ?? null,
        exerciseType: 'strength',
        cardioModality: null,
        targetDurationSec: null,
        targetDistance: null,
        incrementLbs,
      });
    },
    onSuccess: (_data, incrementLbs) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.programs });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success(incrementLbs === null ? 'Using the default step' : `Step set to ${formatWeight(incrementLbs)} lb`);
      onClose();
    },
    onError: () => toast.error('Failed to save the step'),
  });

  const customValue = parseFloat(custom);
  const customValid = custom.trim() !== '' && customValue > 0 && customValue <= 100;
  const options = learned !== null && !PRESETS.includes(learned) && learned <= 100
    ? [...PRESETS, learned].sort((a, b) => a - b)
    : PRESETS;
  const own = exercise.incrementLbs ?? null;

  return (
    <Modal isOpen onClose={onClose} title={`Weight step: ${exercise.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          How much this machine or bar goes up at a time. Bigger steps need more reps before the
          app suggests going up.
        </p>
        {learned !== null && (
          <p className="text-sm text-primary-700 dark:text-primary-300">
            You've been going up {formatWeight(learned)} lb on this lift.
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {options.map((value) => (
            <Button
              key={value}
              type="button"
              size="lg"
              variant={value === step ? 'primary' : 'secondary'}
              disabled={save.isPending}
              onClick={() => save.mutate(value)}
            >
              {formatWeight(value)} lb{value === learned && value !== step ? ' ★' : ''}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Other (lb)"
            aria-label="Custom weight step in pounds"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!customValid || save.isPending}
            onClick={() => save.mutate(customValue)}
          >
            Set
          </Button>
        </div>
        {own !== null && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={save.isPending}
            onClick={() => save.mutate(null)}
          >
            Use the default ({formatWeight(globalStep)} lb)
          </Button>
        )}
      </div>
    </Modal>
  );
}
