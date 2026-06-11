import { useState } from 'react';

interface ExerciseNoteProps {
  note: string;
  onSetNote?: (note: string | null) => void;
}

export function ExerciseNote({ note, onSetNote }: ExerciseNoteProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const isEditing = draft !== null;

  const handleSave = () => {
    if (draft === null || !onSetNote) return;
    const trimmed = draft.trim();
    onSetNote(trimmed === '' ? null : trimmed);
    setDraft(null);
  };

  const handleClear = () => {
    if (!onSetNote) return;
    if (!confirm('Delete note?')) return;
    onSetNote(null);
    setDraft(null);
  };

  return (
    <div className="mt-1 px-3 py-2 text-sm
                    bg-amber-50 dark:bg-amber-900/20
                    text-amber-800 dark:text-amber-200
                    rounded-lg">
      {isEditing ? (
        <>
          <textarea
            value={draft ?? ''}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            autoFocus
            className="w-full bg-white dark:bg-surface-800
                       border border-amber-200 dark:border-amber-700/50
                       rounded p-2 text-sm
                       text-amber-900 dark:text-amber-100
                       focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex justify-end gap-2 mt-1">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-xs px-3 py-2 min-h-[44px] rounded-lg
                         text-amber-700 dark:text-amber-300
                         hover:bg-amber-100 dark:hover:bg-amber-900/30
                         transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="text-xs px-3 py-2 min-h-[44px] rounded-lg font-medium
                         bg-amber-500 text-white hover:bg-amber-600
                         dark:bg-amber-600 dark:hover:bg-amber-500
                         transition-colors"
            >
              Save
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="italic whitespace-pre-wrap break-words">{note}</p>
          {onSetNote && (
            <div className="flex justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={handleClear}
                className="text-xs px-3 py-2 min-h-[44px] rounded-lg
                           text-amber-700 dark:text-amber-300
                           hover:bg-amber-100 dark:hover:bg-amber-900/30
                           transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setDraft(note)}
                className="text-xs px-3 py-2 min-h-[44px] rounded-lg
                           text-amber-700 dark:text-amber-300
                           hover:bg-amber-100 dark:hover:bg-amber-900/30
                           transition-colors"
              >
                Edit
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
