import { useMemo, useState } from 'react';
import { SetInput } from './SetInput';
import { CardioSetInput } from './CardioSetInput';
import { ExerciseNote } from './ExerciseNote';
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
                className="ml-1 -my-2 min-w-[44px] min-h-[44px]
                           flex items-center justify-center
                           text-amber-500 hover:text-amber-600
                           dark:text-amber-400 dark:hover:text-amber-300
                           rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20
                           transition-colors shrink-0"
                aria-label={showNote ? 'Hide note' : 'Show note'}
                aria-expanded={showNote}
                title="Toggle note"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h4m1-12H7a2 2 0 00-2 2v14l4-3h8a2 2 0 002-2V8l-4-4z" />
                </svg>
              </button>
            )}
            {onSwapExercise && (
              <button
                onClick={onSwapExercise}
                className="ml-1 -my-2 min-w-[44px] min-h-[44px]
                           flex items-center justify-center
                           text-gray-400 hover:text-primary-600
                           dark:hover:text-primary-400 rounded-lg
                           hover:bg-gray-100 dark:hover:bg-surface-700
                           transition-colors shrink-0"
                aria-label="Swap exercise"
                title="Replace exercise"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            )}
          </div>
          {note && showNote && (
            <ExerciseNote note={note} onSetNote={onSetNote} />
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

          const previousCell = (
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
          );
          const arrowCell = <span className="text-gray-400 dark:text-gray-500 text-sm">→</span>;

          return (
            <div key={setNumber}>
              {/* Main set row */}
              {currentSet && isEditing ? (
                /* Full-width edit row */
                <div className="flex items-center gap-2 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*\.?[0-9]*"
                    aria-label="Edit weight in pounds"
                    value={editingSet?.weight ?? ''}
                    onChange={(e) => setEditingSet(prev => prev ? { ...prev, weight: e.target.value } : null)}
                    onFocus={(e) => e.target.select()}
                    autoFocus
                    className="flex-1 min-w-0 h-11 text-center text-lg font-semibold tabular-nums
                               border-2 border-gray-200 dark:border-surface-800 rounded-lg
                               bg-white dark:bg-surface-900 dark:text-white
                               focus:border-primary-500 focus:ring-0 transition-colors"
                  />
                  <span className="text-gray-400 dark:text-gray-500 shrink-0">×</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label="Edit number of reps"
                    value={editingSet?.reps ?? ''}
                    onChange={(e) => setEditingSet(prev => prev ? { ...prev, reps: e.target.value } : null)}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 min-w-0 h-11 text-center text-lg font-semibold tabular-nums
                               border-2 border-gray-200 dark:border-surface-800 rounded-lg
                               bg-white dark:bg-surface-900 dark:text-white
                               focus:border-primary-500 focus:ring-0 transition-colors"
                  />
                  <Button variant="primary" size="sm" className="min-w-[44px] shrink-0"
                          onClick={handleSaveEdit} aria-label="Save set">
                    ✓
                  </Button>
                  <Button variant="secondary" size="sm" className="min-w-[44px] shrink-0"
                          onClick={() => setEditingSet(null)} aria-label="Cancel edit">
                    ✕
                  </Button>
                </div>
              ) : currentSet ? (
                /* Logged set — whole row taps to edit, swipes to delete */
                <SwipeableRow
                  onSwipeLeft={() => onDeleteSet(currentSet.id)}
                  disabled={currentSet.id < 0}
                >
                  <div
                    role={onUpdateSet ? 'button' : undefined}
                    tabIndex={onUpdateSet ? 0 : undefined}
                    onClick={() => handleSetTap(currentSet)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSetTap(currentSet); }}
                    className={`grid grid-cols-[1fr_auto_2fr] gap-2 items-center min-h-[44px] py-1.5 rounded-lg
                               ${onUpdateSet ? 'cursor-pointer' : ''}
                               ${showBetterHighlight ? 'bg-green-50 dark:bg-green-900/10' : ''}`}
                  >
                    {previousCell}
                    {arrowCell}
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <span className="font-medium text-green-600 dark:text-green-400 truncate">
                        ✓ {currentSet.weight}×{currentSet.reps}
                        {currentSet.perceivedEffort && (
                          <span className="ml-1 text-xs text-gray-500">RPE {currentSet.perceivedEffort}</span>
                        )}
                      </span>
                      {onUpdateSet && (
                        <svg className="w-4 h-4 mr-1 text-gray-300 dark:text-gray-600 shrink-0"
                             fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      )}
                    </div>
                  </div>
                </SwipeableRow>
              ) : (
                /* Not yet logged */
                <div
                  className={`grid grid-cols-[1fr_auto_2fr] gap-2 items-center min-h-[44px] py-1.5 rounded-lg
                             ${isCurrentRow ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                >
                  {previousCell}
                  {arrowCell}
                  {isCurrentRow ? (
                    <span className="text-primary-600 dark:text-primary-400 font-medium text-sm">
                      Set {setNumber}
                    </span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>
                  )}
                </div>
              )}

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
