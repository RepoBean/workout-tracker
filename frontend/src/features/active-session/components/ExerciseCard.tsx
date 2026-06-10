import { useMemo, useState } from 'react';
import { SetInput } from './SetInput';
import { CardioSetInput } from './CardioSetInput';
import { SwipeableRow } from '../../../shared/ui/SwipeableRow';
import { Button } from '../../../shared/ui/Button';
import type { Exercise, Set } from '../../../shared/api/types';
import { isCardioExercise } from '../../../shared/api/predicates';
import { formatMMSS } from '../../../shared/utils/format';
import { useProgression } from '../../../shared/context/ProgressionContext';
import { computeProgression } from '../logic/progression';
import type { PreviousExerciseHint } from '../hooks/usePreviousData';

interface ExerciseCardProps {
  exercise: Exercise;
  loggedSets: Set[];
  previousHint?: PreviousExerciseHint;
  note?: string | null;
  onLogSet: (data: {
    exerciseId: number | null;
    exerciseName: string;
    weight: number;
    reps: number;
    setNumber: number;
    perceivedEffort?: number;
    dropIndex?: number;
    durationSec?: number | null;
    distance?: number | null;
  }) => void;
  onDeleteSet: (setId: number) => void;
  onUpdateSet?: (setId: number, updates: { weight?: number; reps?: number }) => void;
  onSetNote?: (note: string | null) => void;
  onSwapExercise?: () => void;
  isLogging: boolean;
}

interface EditingSet {
  id: number;
  weight: string;
  reps: string;
}

export function ExerciseCard({
  exercise,
  loggedSets,
  previousHint,
  note,
  onLogSet,
  onDeleteSet,
  onUpdateSet,
  onSetNote,
  onSwapExercise,
  isLogging,
}: ExerciseCardProps) {
  const [editingSet, setEditingSet] = useState<EditingSet | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const isEditingNote = editingNote !== null;

  const handleNoteSave = () => {
    if (editingNote === null || !onSetNote) return;
    const trimmed = editingNote.trim();
    onSetNote(trimmed === '' ? null : trimmed);
    setEditingNote(null);
  };

  const handleNoteClear = () => {
    if (!onSetNote) return;
    if (!confirm('Delete note?')) return;
    onSetNote(null);
    setEditingNote(null);
  };
  const isCardio = isCardioExercise(exercise);
  const { settings: progressionSettings } = useProgression();

  // Only count standard sets (dropIndex=0) for completion
  const standardSets = useMemo(
    () => loggedSets.filter(s => (s.dropIndex || 0) === 0),
    [loggedSets]
  );
  const nextSetNumber = standardSets.length + 1;
  const isComplete = isCardio
    ? loggedSets.length >= 1
    : standardSets.length >= exercise.targetSets;

  // Get current set by setNumber
  const getLoggedSet = (setNumber: number): Set | undefined => {
    return standardSets.find(s => s.setNumber === setNumber);
  };

  // Get previous set by setNumber
  const getPreviousSet = (setNumber: number) => {
    return previousHint?.sets?.find(s => s.setNumber === setNumber);
  };

  // Parse target reps (handle "8-10" format)
  const hintReps = useMemo(() => {
    const match = exercise.targetReps.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 10;
  }, [exercise.targetReps]);

  // Auto-progression: deterministic double-progression suggestion from last session.
  // Off by default, never for cardio. Only influences the pre-fill before the first
  // set is logged this session — once you've logged a set, that wins (see chain below).
  const noSetsLoggedYet = standardSets.length === 0;
  const progressionResult = useMemo(() => {
    if (!progressionSettings.enabled || isCardio) return null;
    if (!previousHint?.sets || previousHint.sets.length === 0) return null;
    return computeProgression({
      previousSets: previousHint.sets,
      targetReps: exercise.targetReps,
      incrementLbs: progressionSettings.incrementLbs,
    });
  }, [progressionSettings, isCardio, previousHint, exercise.targetReps]);

  // Priority: 1) Last set from THIS session, 2) Progression suggestion (pre-first-set),
  // 3) Matching set from previous session, 4) Previous session's last weight, 5) 0
  const lastCurrentSessionSet = standardSets.length > 0 ? standardSets[standardSets.length - 1] : null;
  const matchingPreviousSet = getPreviousSet(nextSetNumber);
  const hintWeight = lastCurrentSessionSet?.weight
    ?? (noSetsLoggedYet ? progressionResult?.suggestedWeight : undefined)
    ?? matchingPreviousSet?.weight
    ?? previousHint?.lastWeight
    ?? 0;
  // For reps: progression suggestion first (pre-first-set), then previous session's
  // matching set reps, or target reps from exercise
  const hintRepsForInput = (noSetsLoggedYet ? progressionResult?.suggestedReps : undefined)
    ?? matchingPreviousSet?.reps
    ?? hintReps;

  // Get drop sets for display (grouped by setNumber)
  const dropSetsBySetNumber = useMemo(() => {
    const map = new Map<number, Set[]>();
    for (const set of loggedSets) {
      if ((set.dropIndex || 0) > 0) {
        const existing = map.get(set.setNumber) || [];
        map.set(set.setNumber, [...existing, set].sort((a, b) => (a.dropIndex || 0) - (b.dropIndex || 0)));
      }
    }
    return map;
  }, [loggedSets]);

  const handleSetTap = (set: Set) => {
    if (editingSet?.id === set.id || !onUpdateSet) return;
    setEditingSet({
      id: set.id,
      weight: String(set.weight),
      reps: String(set.reps),
    });
  };

  const handleSaveEdit = () => {
    if (!editingSet || !onUpdateSet) return;

    const weight = parseFloat(editingSet.weight);
    const reps = parseInt(editingSet.reps, 10);

    if (!isNaN(weight) && weight >= 0 && !isNaN(reps) && reps > 0) {
      onUpdateSet(editingSet.id, { weight, reps });
    }
    setEditingSet(null);
  };

  // Check if this time is better than last time
  const isBetter = (current: Set, previous: { weight: number; reps: number } | undefined): boolean => {
    if (!previous) return false;
    return current.weight > previous.weight || current.reps > previous.reps;
  };

  return (
    <div className={`card transition-all ${isComplete ? 'ring-2 ring-green-500/50 dark:ring-green-400/50 bg-green-50/30 dark:bg-green-900/10' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center">
            <h3 className="font-display font-bold text-xl truncate">{exercise.name}</h3>
            {note && (
              <button
                onClick={() => setShowNote(s => !s)}
                className="ml-2 p-1.5 text-amber-500 hover:text-amber-600
                           dark:text-amber-400 dark:hover:text-amber-300
                           rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20
                           transition-colors shrink-0"
                aria-label={showNote ? 'Hide note' : 'Show note'}
                aria-expanded={showNote}
                title="Toggle note"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h4m1-12H7a2 2 0 00-2 2v14l4-3h8a2 2 0 002-2V8l-4-4z" />
                </svg>
              </button>
            )}
            {onSwapExercise && (
              <button
                onClick={onSwapExercise}
                className="ml-2 p-1.5 text-gray-400 hover:text-primary-600
                           dark:hover:text-primary-400 rounded-lg
                           hover:bg-gray-100 dark:hover:bg-gray-700
                           transition-colors shrink-0"
                aria-label="Swap exercise"
                title="Replace exercise"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            )}
          </div>
          {note && showNote && (
            <div className="mt-1 px-3 py-2 text-sm
                            bg-amber-50 dark:bg-amber-900/20
                            text-amber-800 dark:text-amber-200
                            rounded-lg">
              {isEditingNote ? (
                <>
                  <textarea
                    value={editingNote ?? ''}
                    onChange={(e) => setEditingNote(e.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full bg-white dark:bg-surface-800
                               border border-amber-200 dark:border-amber-700/50
                               rounded p-2 text-sm
                               text-amber-900 dark:text-amber-100
                               focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setEditingNote(null)}
                      className="text-xs px-2 py-1 rounded
                                 text-amber-700 dark:text-amber-300
                                 hover:bg-amber-100 dark:hover:bg-amber-900/30
                                 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleNoteSave}
                      className="text-xs px-2 py-1 rounded font-medium
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
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        type="button"
                        onClick={handleNoteClear}
                        className="text-xs px-2 py-1 rounded
                                   text-amber-700 dark:text-amber-300
                                   hover:bg-amber-100 dark:hover:bg-amber-900/30
                                   transition-colors"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingNote(note)}
                        className="text-xs px-2 py-1 rounded
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
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isCardio ? (
              <>
                {exercise.cardioModality && (
                  <span className="capitalize">{exercise.cardioModality}</span>
                )}
                {(exercise.targetDurationSec || exercise.targetDistance) && (
                  <span>
                    {exercise.cardioModality ? ' · ' : ''}
                    {[
                      exercise.targetDurationSec ? `${Math.round(exercise.targetDurationSec / 60)} min` : null,
                      exercise.targetDistance ? `${exercise.targetDistance} mi` : null,
                    ].filter(Boolean).join(' / ')}
                  </span>
                )}
              </>
            ) : (
              <>
                {exercise.targetSets} sets × {exercise.targetReps} reps
                {exercise.supersetGroup && (
                  <span className="ml-2 px-2 py-0.5 bg-purple-100 dark:bg-purple-900
                                 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                    Superset {exercise.supersetGroup}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        {isComplete && (
          <span className="shrink-0 ml-2 px-2 py-1 bg-green-100 dark:bg-green-900
                          text-green-700 dark:text-green-300 text-sm font-medium rounded">
            Complete
          </span>
        )}
      </div>

      {/* Side-by-side comparison grid (strength only) */}
      {!isCardio && (
      <div className="mb-4">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_2fr] gap-2 items-center mb-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="text-right pr-2">Last</div>
          <span></span>
          <div>This time</div>
        </div>

        {/* Set rows */}
        {Array.from({ length: exercise.targetSets }, (_, i) => i + 1).map((setNumber) => {
          const previousSet = getPreviousSet(setNumber);
          const currentSet = getLoggedSet(setNumber);
          const isCurrentRow = setNumber === nextSetNumber;
          const isEditing = editingSet?.id === currentSet?.id;
          const dropSets = dropSetsBySetNumber.get(setNumber) || [];
          const showBetterHighlight = currentSet && isBetter(currentSet, previousSet);

          return (
            <div key={setNumber}>
              {/* Main set row */}
              <div
                className={`grid grid-cols-[1fr_auto_2fr] gap-2 items-center py-1.5 rounded-lg
                           ${isCurrentRow ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                           ${showBetterHighlight ? 'bg-green-50 dark:bg-green-900/10' : ''}`}
              >
                {/* Last time (left - 1/3 width) */}
                <div className="text-right text-gray-500 dark:text-gray-400 text-sm pr-2 tabular-nums">
                  {previousSet ? (
                    <>
                      {previousSet.weight}×{previousSet.reps}
                      {previousSet.perceivedEffort != null && (
                        <span className="ml-1 text-xs text-gray-500">RPE {previousSet.perceivedEffort}</span>
                      )}
                    </>
                  ) : '—'}
                </div>

                {/* Arrow */}
                <span className="text-gray-400 dark:text-gray-500 text-sm">→</span>

                {/* This time (right) */}
                <div>
                  {currentSet ? (
                    isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editingSet?.weight ?? ''}
                          onChange={(e) => setEditingSet(prev => prev ? { ...prev, weight: e.target.value } : null)}
                          className="w-12 text-center text-sm font-semibold border rounded py-0.5
                                     dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          autoFocus
                        />
                        <span className="text-xs">×</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editingSet?.reps ?? ''}
                          onChange={(e) => setEditingSet(prev => prev ? { ...prev, reps: e.target.value } : null)}
                          className="w-10 text-center text-sm font-semibold border rounded py-0.5
                                     dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                        <Button variant="primary" size="sm" onClick={handleSaveEdit}>
                          ✓
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setEditingSet(null)}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <SwipeableRow
                        onSwipeLeft={() => onDeleteSet(currentSet.id)}
                        disabled={currentSet.id < 0}
                      >
                        <span
                          className={`font-medium cursor-pointer ${showBetterHighlight ? 'text-green-600 dark:text-green-400' : 'text-green-600 dark:text-green-400'}`}
                          onClick={() => handleSetTap(currentSet)}
                        >
                          ✓ {currentSet.weight}×{currentSet.reps}
                          {currentSet.perceivedEffort && (
                            <span className="ml-1 text-xs text-gray-500">RPE {currentSet.perceivedEffort}</span>
                          )}
                        </span>
                      </SwipeableRow>
                    )
                  ) : isCurrentRow ? (
                    <span className="text-primary-600 dark:text-primary-400 font-medium text-sm">
                      Set {setNumber}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
                  )}
                </div>
              </div>

              {/* Drop sets (indented, displayed but not editable via UI) */}
              {dropSets.map((dropSet) => (
                <SwipeableRow
                  key={dropSet.id}
                  onSwipeLeft={() => onDeleteSet(dropSet.id)}
                  disabled={dropSet.id < 0}
                >
                  <div className="grid grid-cols-[1fr_auto_2fr] gap-2 items-center py-1 ml-4
                                  bg-orange-50 dark:bg-orange-900/20 rounded-lg mt-1">
                    <div className="text-right text-xs text-gray-400 pr-2">—</div>
                    <span className="text-gray-400 text-xs">↳</span>
                    <span className="text-orange-600 dark:text-orange-400 text-sm">
                      Drop {dropSet.dropIndex}: {dropSet.weight}×{dropSet.reps}
                    </span>
                  </div>
                </SwipeableRow>
              ))}
            </div>
          );
        })}
      </div>
      )}

      {/* Cardio: render logged effort summary if present */}
      {isCardio && loggedSets.length > 0 && (
        <div className="mb-4 space-y-1">
          {loggedSets.map((set) => (
            <SwipeableRow
              key={set.id}
              onSwipeLeft={() => onDeleteSet(set.id)}
              disabled={set.id < 0}
            >
              <div className="flex items-center justify-between py-2 px-3 rounded-lg
                              bg-green-50 dark:bg-green-900/20">
                <span className="text-green-700 dark:text-green-300 font-medium tabular-nums">
                  ✓ {set.durationSec ? formatMMSS(set.durationSec) : '—'}
                  {set.distance != null && set.distance > 0 && (
                    <span className="ml-2">• {set.distance} mi</span>
                  )}
                </span>
                {set.heartRateAvg != null && (
                  <span className="text-xs text-red-600 dark:text-red-400 tabular-nums">
                    avg {set.heartRateAvg} BPM
                  </span>
                )}
              </div>
            </SwipeableRow>
          ))}
        </div>
      )}

      {/* Input (if not complete) */}
      {!isComplete && (
        isCardio ? (
          <CardioSetInput
            exerciseId={exercise.id}
            exerciseName={exercise.name}
            setNumber={nextSetNumber}
            targetDurationSec={exercise.targetDurationSec}
            targetDistance={exercise.targetDistance}
            onLogSet={onLogSet}
            isLogging={isLogging}
          />
        ) : (
          <>
            {progressionResult && noSetsLoggedYet && (
              <div
                className={`mb-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                  ${progressionResult.ready
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-400'}`}
              >
                {progressionResult.ready && <span aria-hidden>📈</span>}
                <span>{progressionResult.reason}</span>
              </div>
            )}
            <SetInput
              exerciseId={exercise.id}
              exerciseName={exercise.name}
              setNumber={nextSetNumber}
              previousWeight={hintWeight}
              previousReps={hintRepsForInput}
              onLogSet={onLogSet}
              isLogging={isLogging}
            />
          </>
        )
      )}
    </div>
  );
}
