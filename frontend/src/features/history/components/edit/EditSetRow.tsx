import { useState } from 'react';
import type { Set } from '../../../../shared/api/types';
import { isCardioSet } from '../../../../shared/api/predicates';
import { formatMMSS, formatWeight, parseDurationToSec } from '../../../../shared/utils/format';
import { SwipeableRow } from '../../../../shared/ui/SwipeableRow';
import { AssistToggle } from '../../../active-session/components/AssistToggle';
import type { SetPatch } from '../../hooks/useSessionEdits';

interface EditSetRowProps {
  set: Set;
  onSave: (patch: SetPatch) => void;
  onDelete: () => void;
}

const fieldClass = `w-full min-h-[44px] px-2 rounded-lg border border-gray-200 dark:border-surface-700
                    bg-white dark:bg-surface-800 text-center focus:outline-none focus:border-primary-500`;

/** One logged set: tap to edit in place, swipe left to delete. */
export function EditSetRow({ set, onSave, onDelete }: EditSetRowProps) {
  const [editing, setEditing] = useState(false);
  const cardio = isCardioSet(set);

  return (
    <SwipeableRow onSwipeLeft={onDelete}>
      {editing ? (
        cardio
          ? <CardioFields set={set} onDone={(patch) => { if (patch) onSave(patch); setEditing(false); }} />
          : <StrengthFields set={set} onDone={(patch) => { if (patch) onSave(patch); setEditing(false); }} />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`w-full min-h-[44px] flex items-center gap-3 px-2 text-sm text-left rounded-lg
                      hover:bg-gray-50 dark:hover:bg-surface-800
                      ${set.dropIndex > 0 ? 'pl-6 text-orange-600 dark:text-orange-400' : ''}`}
        >
          <span className="w-14 text-gray-500 dark:text-gray-400">
            {set.dropIndex > 0 ? `Drop ${set.dropIndex}` : `Set ${set.setNumber}`}
          </span>
          {cardio ? (
            <span className="flex-1">
              {set.durationSec ? formatMMSS(set.durationSec) : '—'}
              {set.distance != null && set.distance > 0 && <span> · {set.distance} mi</span>}
            </span>
          ) : (
            <span className="flex-1">{formatWeight(set.weight)} lbs × {set.reps}</span>
          )}
          {set.perceivedEffort != null && (
            <span className="text-xs text-gray-400">RPE {set.perceivedEffort}</span>
          )}
        </button>
      )}
    </SwipeableRow>
  );
}

function RpeSelect({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <select
      aria-label="RPE"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={fieldClass}
    >
      <option value="">RPE –</option>
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
        <option key={n} value={n}>RPE {n}</option>
      ))}
    </select>
  );
}

function DoneButtons({ onCancel, onSave, canSave }: { onCancel: () => void; onSave: () => void; canSave: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel}
        className="text-sm px-3 min-h-[44px] rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-800">
        Cancel
      </button>
      <button type="button" onClick={onSave} disabled={!canSave}
        className="text-sm px-4 min-h-[44px] rounded-lg font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
        Save
      </button>
    </div>
  );
}

function StrengthFields({ set, onDone }: { set: Set; onDone: (patch: SetPatch | null) => void }) {
  const [assisted, setAssisted] = useState(set.weight < 0);
  const [weightStr, setWeightStr] = useState(String(Math.abs(set.weight)));
  const [repsStr, setRepsStr] = useState(String(set.reps));
  const [rpe, setRpe] = useState(set.perceivedEffort);

  const magnitude = Number(weightStr);
  const reps = Number.parseInt(repsStr, 10);
  const valid = weightStr.trim() !== '' && Number.isFinite(magnitude) && magnitude >= 0 && magnitude <= 500
    && Number.isInteger(reps) && reps >= 1;

  const save = () => {
    const weight = (assisted ? -1 : 1) * magnitude || 0;
    const patch: SetPatch = {};
    if (weight !== set.weight) patch.weight = weight;
    if (reps !== set.reps) patch.reps = reps;
    if (rpe !== set.perceivedEffort) patch.perceivedEffort = rpe;
    onDone(Object.keys(patch).length > 0 ? patch : null);
  };

  return (
    <div className="p-2 space-y-2 rounded-lg bg-gray-50 dark:bg-surface-800/60">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
        <input aria-label="Weight" inputMode="decimal" value={weightStr}
          onChange={(e) => setWeightStr(e.target.value)} className={fieldClass} />
        <AssistToggle assisted={assisted} onToggle={() => setAssisted(a => !a)} className="px-2" />
        <input aria-label="Reps" inputMode="numeric" value={repsStr}
          onChange={(e) => setRepsStr(e.target.value)} className={fieldClass} />
      </div>
      <RpeSelect value={rpe} onChange={setRpe} />
      <DoneButtons onCancel={() => onDone(null)} onSave={save} canSave={valid} />
    </div>
  );
}

function CardioFields({ set, onDone }: { set: Set; onDone: (patch: SetPatch | null) => void }) {
  const [durationStr, setDurationStr] = useState(set.durationSec ? formatMMSS(set.durationSec) : '');
  const [distanceStr, setDistanceStr] = useState(set.distance != null ? String(set.distance) : '');
  const [rpe, setRpe] = useState(set.perceivedEffort);

  const durationSec = parseDurationToSec(durationStr);
  const distance = distanceStr.trim() === '' ? null : Number(distanceStr);
  const valid = (durationSec != null || (distance != null && distance > 0))
    && (distance == null || (Number.isFinite(distance) && distance >= 0));

  const save = () => {
    const patch: SetPatch = {};
    if (durationSec !== set.durationSec) patch.durationSec = durationSec;
    if (distance !== set.distance) patch.distance = distance;
    if (rpe !== set.perceivedEffort) patch.perceivedEffort = rpe;
    onDone(Object.keys(patch).length > 0 ? patch : null);
  };

  return (
    <div className="p-2 space-y-2 rounded-lg bg-gray-50 dark:bg-surface-800/60">
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="Duration (m:ss)" placeholder="m:ss" value={durationStr}
          onChange={(e) => setDurationStr(e.target.value)} className={fieldClass} />
        <input aria-label="Distance (mi)" placeholder="mi" inputMode="decimal" value={distanceStr}
          onChange={(e) => setDistanceStr(e.target.value)} className={fieldClass} />
      </div>
      <RpeSelect value={rpe} onChange={setRpe} />
      <DoneButtons onCancel={() => onDone(null)} onSave={save} canSave={valid} />
    </div>
  );
}

/** Add a cardio set with plain fields (no live timer in the editor). */
export function AddCardioSet({ onAdd, disabled }: {
  onAdd: (v: { durationSec: number | null; distance: number | null }) => void;
  disabled?: boolean;
}) {
  const [durationStr, setDurationStr] = useState('');
  const [distanceStr, setDistanceStr] = useState('');
  const durationSec = parseDurationToSec(durationStr);
  const distance = distanceStr.trim() === '' ? null : Number(distanceStr);
  const valid = (durationSec != null || (distance != null && distance > 0))
    && (distance == null || (Number.isFinite(distance) && distance >= 0));

  return (
    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
      <input aria-label="Duration (m:ss)" placeholder="m:ss" value={durationStr}
        onChange={(e) => setDurationStr(e.target.value)} className={fieldClass} />
      <input aria-label="Distance (mi)" placeholder="mi" inputMode="decimal" value={distanceStr}
        onChange={(e) => setDistanceStr(e.target.value)} className={fieldClass} />
      <button type="button" disabled={!valid || disabled}
        onClick={() => { onAdd({ durationSec, distance }); setDurationStr(''); setDistanceStr(''); }}
        className="px-4 min-h-[44px] rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">
        Add
      </button>
    </div>
  );
}
