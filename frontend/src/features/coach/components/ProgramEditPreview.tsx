import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';
import type { ProgramEditPlan } from '../lib/programEdit';
import { useApplyProgramEdit } from '../hooks/useApplyProgramEdit';

interface ProgramEditPreviewProps {
  plan: ProgramEditPlan | null;
  onClose: () => void;
}

/**
 * The coach's proposed program edit, change by change. Model-generated, so it shows exactly
 * what Apply will write — removals included — and nothing happens until the user taps Apply.
 */
export function ProgramEditPreview({ plan, onClose }: ProgramEditPreviewProps) {
  const apply = useApplyProgramEdit();

  return (
    <Modal isOpen={!!plan} onClose={onClose} title="Change your program?">
      {plan && (
        <div className="space-y-4">
          <p className="text-sm">
            <span className="font-medium">Program:</span> {plan.programName}
          </p>
          <div className="max-h-[45vh] overflow-y-auto space-y-3 rounded-lg border border-gray-200 dark:border-surface-700 p-3">
            {plan.workouts.map((w, wi) => (
              <div key={wi}>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {w.name}
                  {!w.workout && (
                    <span className="ml-1.5 text-xs font-medium text-primary-600 dark:text-primary-400">new workout</span>
                  )}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {w.adds.map((a, i) => (
                    <li key={`a${i}`} className="flex justify-between gap-3 text-primary-700 dark:text-primary-300">
                      <span className="min-w-0 break-words">+ {a.name}</span>
                      <span className="shrink-0 tabular-nums">
                        {a.supersetGroup ? `${a.supersetGroup} · ` : ''}{a.targetSets} × {a.targetReps}
                        {a.incrementLbs ? ` · +${a.incrementLbs} lb` : ''}
                      </span>
                    </li>
                  ))}
                  {w.removes.map((r) => (
                    <li key={`r${r.id}`} className="text-gray-500 dark:text-gray-400">
                      − <span className="line-through">{r.name}</span>
                    </li>
                  ))}
                  {w.updates.map((u) => (
                    <li key={`u${u.exercise.id}`} className="flex justify-between gap-3 text-gray-700 dark:text-gray-300">
                      <span className="min-w-0 break-words">{u.exercise.name}</span>
                      <span className="shrink-0 text-right tabular-nums">{u.changes.join(' · ')}</span>
                    </li>
                  ))}
                  {w.reordered && (
                    <li className="text-gray-500 dark:text-gray-400">
                      New order: {w.order.map((o) => ('id' in o
                        ? w.workout?.exercises?.find((e) => e.id === o.id)?.name
                        : w.adds[o.add].name)).join(' → ')}
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Applies to the program itself. Past sessions and history are not touched.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => apply.mutate(plan, { onSettled: onClose })}
              disabled={apply.isPending}
            >
              {apply.isPending ? 'Applying…' : 'Apply'}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={apply.isPending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
