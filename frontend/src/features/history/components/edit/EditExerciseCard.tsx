import { useState } from 'react';
import type { LogSetRequest, Set } from '../../../../shared/api/types';
import { SetInput } from '../../../active-session/components/SetInput';
import { ExerciseNote } from '../../../active-session/components/ExerciseNote';
import { nextSetNumber } from '../../logic/editSession';
import type { SetPatch } from '../../hooks/useSessionEdits';
import { AddCardioSet, EditSetRow } from './EditSetRow';

interface EditExerciseCardProps {
  name: string;
  exerciseId: number | null;
  cardio: boolean;
  sets: Set[];
  note: string | undefined;
  onAddSet: (body: LogSetRequest) => void;
  onUpdateSet: (setId: number, patch: SetPatch) => void;
  onDeleteSet: (set: Set) => void;
  onSetNote: (note: string | null) => void;
}

/** One exercise in the history editor: its sets, its note, and an add-set row. */
export function EditExerciseCard({
  name, exerciseId, cardio, sets, note, onAddSet, onUpdateSet, onDeleteSet, onSetNote,
}: EditExerciseCardProps) {
  const [addingNote, setAddingNote] = useState(false);
  const setNumber = nextSetNumber(sets);
  const last = [...sets].reverse().find(s => (s.dropIndex || 0) === 0);

  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display font-bold">{name}</h2>
        {!note && !addingNote && (
          <button type="button" onClick={() => setAddingNote(true)}
            className="text-xs px-2 min-h-[44px] text-amber-700 dark:text-amber-300">
            + Note
          </button>
        )}
      </div>

      {(note || addingNote) && (
        <ExerciseNote
          note={note ?? ''}
          startEditing={addingNote}
          onCancel={() => setAddingNote(false)}
          onSetNote={(n) => { onSetNote(n); setAddingNote(false); }}
        />
      )}

      <div className="space-y-1">
        {sets.map(set => (
          <EditSetRow
            key={set.id}
            set={set}
            onSave={(patch) => onUpdateSet(set.id, patch)}
            onDelete={() => onDeleteSet(set)}
          />
        ))}
      </div>

      {cardio ? (
        <AddCardioSet
          onAdd={({ durationSec, distance }) => onAddSet({
            exerciseId, exerciseName: name, weight: 0, reps: 0, setNumber, durationSec, distance,
          })}
        />
      ) : (
        <SetInput
          // Re-key per set number so the prefill follows the last logged set.
          key={`${name}:${setNumber}`}
          persist={false}
          exerciseId={exerciseId}
          exerciseName={name}
          setNumber={setNumber}
          previousWeight={last?.weight ?? 0}
          previousReps={last?.reps ?? 10}
          onLogSet={(data) => onAddSet({ ...data, exerciseId: data.exerciseId })}
        />
      )}
    </div>
  );
}
