import { useState } from 'react';
import type { BodyWeight } from '../../../shared/api/types';
import { useDeleteWeighIn, useUpdateWeighIn } from '../../../shared/api/bodyweights';
import { formatBodyweight } from '../../../shared/lib/bodyweight';
import { SwipeableRow } from '../../../shared/ui/SwipeableRow';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
import { formatSessionDate } from './detailParts';
import { latestLoggableDate, parseWeighInWeight } from './weighInForm';

/** One weigh-in: tap to edit weight/date inline, swipe left to delete. */
export function WeighInRow({ weighIn }: { weighIn: BodyWeight }) {
  const [editing, setEditing] = useState(false);
  const [weightStr, setWeightStr] = useState(formatBodyweight(weighIn.weight));
  const [date, setDate] = useState(weighIn.date);
  const [error, setError] = useState<string | undefined>();
  const update = useUpdateWeighIn();
  const remove = useDeleteWeighIn();

  const startEdit = () => {
    setWeightStr(formatBodyweight(weighIn.weight));
    setDate(weighIn.date);
    setError(undefined);
    setEditing(true);
  };

  const save = () => {
    const parsed = parseWeighInWeight(weightStr);
    if (typeof parsed === 'string') {
      setError(parsed);
      return;
    }
    if (!date) {
      setError('Pick a date');
      return;
    }
    if (parsed === weighIn.weight && date === weighIn.date) {
      setEditing(false);
      return;
    }
    update.mutate(
      { id: weighIn.id, weight: parsed, date },
      { onSuccess: () => setEditing(false) }
    );
  };

  const handleDelete = () => {
    if (!confirm(`Delete the ${formatSessionDate(`${weighIn.date}T12:00:00`)} weigh-in?`)) return;
    remove.mutate(weighIn.id);
  };

  if (editing) {
    return (
      <li className="py-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Input
            aria-label="Weight (lbs)"
            type="number"
            inputMode="decimal"
            step="0.1"
            value={weightStr}
            onChange={(e) => setWeightStr(e.target.value)}
            error={error}
          />
          <Input
            aria-label="Date"
            type="date"
            value={date}
            max={latestLoggableDate()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={update.isPending}>Save</Button>
        </div>
      </li>
    );
  }

  return (
    <li>
      <SwipeableRow onSwipeLeft={handleDelete} disabled={remove.isPending}>
        <button
          onClick={startEdit}
          className="w-full flex items-center justify-between py-3 min-h-[44px] text-left"
        >
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {formatSessionDate(`${weighIn.date}T12:00:00`)}
          </span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {formatBodyweight(weighIn.weight)} lbs
          </span>
        </button>
      </SwipeableRow>
    </li>
  );
}
