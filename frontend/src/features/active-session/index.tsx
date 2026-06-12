import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useActiveSession } from './hooks/useActiveSession';
import { usePreviousData } from './hooks/usePreviousData';
import { useExerciseNavigation } from './hooks/useExerciseNavigation';
import { useAdHocExercises } from './hooks/useAdHocExercises';
import { useExerciseOrdering } from './hooks/useExerciseOrdering';
import { useRpeFlow } from './hooks/useRpeFlow';
import { useDiscardSession } from './hooks/useDiscardSession';
import { clearSessionLocalState } from './lib/sessionStorage';
import { useExerciseHistoryByName } from '../../shared/api/queries';
import { SessionHeader } from './components/SessionHeader';
import { ExerciseCard } from './components/ExerciseCard';
import { ExerciseListDropdown } from './components/ExerciseListDropdown';
import { AddExercise } from './components/AddExercise';
import { SwapExercise } from './components/SwapExercise';
import { SupersetStep } from './components/SupersetStep';
import { CompletedSessionSummary } from './components/CompletedSessionSummary';
import { RpePrompt } from './components/RpePrompt';
import { CompletionCelebration } from './components/CompletionCelebration';
import { LiveHRChart } from './components/LiveHRChart';
import { useTimer } from '../../shared/context/TimerContext';
import { useHeartRate } from '../../shared/context/HeartRateContext';
import { downsampleHr } from '../../shared/utils/heartRate';
import { getTargetSets, isCardioExercise, isCardioSet } from '../../shared/api/predicates';
import { CARDIO_MODALITY_INFO } from '../../shared/api/cardio';
import { getHrChartStorageKey } from './lib/sessionStorage';
import { makeVirtualExercise } from './lib/virtualExercise';
import { averageRpe } from './logic/averageRpe';
import type { CardioModality, Exercise } from '../../shared/api/types';

const readHrChartOverride = (sessionId: number): boolean | null => {
  if (!Number.isFinite(sessionId)) return null;
  const raw = localStorage.getItem(getHrChartStorageKey(sessionId));
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
};

export default function ActiveSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = Number(id);

  const {
    session,
    isLoading,
    error,
    logSet,
    isLoggingSet,
    updateSet,
    updateSetsEffort,
    setExerciseNote,
    deleteSet,
    completeSession,
    isCompletingSession,
  } = useActiveSession(sessionId);

  const { exerciseHints } = usePreviousData(sessionId);

  const { stopTimer } = useTimer();
  const { clearSamples: clearHrSamples, samplesSince } = useHeartRate();

  // Reset HR sample buffer once per session mount so per-set/session windows
  // are scoped to this workout.
  useEffect(() => {
    clearHrSamples();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Seed an ad-hoc cardio exercise when the picker passed ?cardio=<modality>.
  // Strip the param after seeding so refresh doesn't re-add.
  const seededCardioRef = sessionId; // re-key the effect when session changes
  useEffect(() => {
    const modality = searchParams.get('cardio') as CardioModality | null;
    if (!modality || !CARDIO_MODALITY_INFO[modality]) return;
    setAdHocExercises(prev => {
      if (prev.some(e => isCardioExercise(e))) return prev;
      return [...prev, {
        tempId: `adhoc-cardio-${Date.now()}`,
        name: CARDIO_MODALITY_INFO[modality].short,
        exerciseType: 'cardio',
        cardioModality: modality,
        targetDurationSec: null,
        targetDistance: null,
      }];
    });
    const next = new URLSearchParams(searchParams);
    next.delete('cardio');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seededCardioRef]);

  const pendingAdvanceStepRef = useRef<number | null>(null);

  // Celebration state
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{
    totalSets: number;
    totalVolume: number;
    duration: number;
    avgRpe: number | null;
    hrSeries: { t: number[]; b: number[] } | null;
  } | null>(null);

  // Swap exercise state
  const [swapTarget, setSwapTarget] = useState<Exercise | null>(null);

  const exercises = session?.exercises || [];
  const sets = session?.sets || [];

  // Ad-hoc exercise management
  const {
    setAdHocExercises,
    setAdHocProgramExercises,
    mergedExercises,
    adHocSetsByName,
    getSetsForExercise,
    allAdHocExercises,
  } = useAdHocExercises({
    sessionId,
    session: session ?? null,
    exercises,
    sets,
  });

  // Detect whether this session has any cardio content. Reacts to ad-hoc
  // cardio seeded mid-flow (e.g. via the dashboard cardio modality picker)
  // and to cardio sets logged on otherwise-undeclared exercises.
  const sessionHasCardio = useMemo(() => {
    if (exercises.some(ex => isCardioExercise(ex))) return true;
    if (allAdHocExercises.some(e => e.exerciseType === 'cardio')) return true;
    if (sets.some(isCardioSet)) return true;
    return false;
  }, [exercises, allAdHocExercises, sets]);

  // Live HR chart visibility — auto-show for cardio, hidden for strength,
  // overridable by tapping the BPM pill. Override persists per session id.
  const [hrChartVisible, setHrChartVisible] = useState<boolean>(() => {
    const override = readHrChartOverride(sessionId);
    return override ?? false; // sessionHasCardio fills in via the effect below
  });

  // Re-evaluate default when cardio detection flips (and the user hasn't set
  // an explicit preference for this session).
  useEffect(() => {
    const override = readHrChartOverride(sessionId);
    if (override === null) {
      setHrChartVisible(sessionHasCardio);
    } else {
      setHrChartVisible(override);
    }
  }, [sessionId, sessionHasCardio]);

  const toggleHrChart = useCallback(() => {
    setHrChartVisible(prev => {
      const next = !prev;
      try {
        localStorage.setItem(getHrChartStorageKey(sessionId), next ? '1' : '0');
      } catch {
        // ignore quota errors — toggle still works for the session
      }
      return next;
    });
  }, [sessionId]);

  // Exercise ordering
  const {
    orderedExercises,
    handleMoveExercise,
    insertExerciseAt,
    swapExercise,
  } = useExerciseOrdering({ mergedExercises, sessionId, isReady: !isLoading && !!session });

  // Exercise navigation hook for focused view
  const navigation = useExerciseNavigation({
    exercises: orderedExercises,
    sets,
    sessionId,
  });

  // Fires only when handleAddExercise gated on a complete current step.
  // Other operations that change steps.length (resume reconstruction, etc.)
  // leave the ref null and are no-ops here.
  useEffect(() => {
    const target = pendingAdvanceStepRef.current;
    if (target !== null && navigation.steps.length > target) {
      navigation.goToStep(target);
      pendingAdvanceStepRef.current = null;
    }
  }, [navigation.steps.length]);

  // RPE flow management
  const {
    rpePromptExercise,
    handleSetLogged,
    handleRpeSubmit,
    handleRpeSkip,
  } = useRpeFlow({
    sessionId,
    navigation,
    mergedExercises,
    updateSetsEffort,
    setExerciseNote,
  });

  // Wire up set logging callback. `opts.onSuccess` lets callers run cleanup
  // only after the POST actually lands (e.g. CardioSetInput clears its
  // persisted timer state — a failed save must keep it for recovery).
  const handleLogSet = (
    data: Parameters<typeof logSet>[0],
    opts?: { onSuccess?: () => void }
  ) => {
    logSet(data, {
      onSuccess: () => {
        handleSetLogged(data.exerciseId ?? null, data.exerciseName, data.dropIndex ?? 0);
        opts?.onSuccess?.();
      },
    });
  };

  // For ad-hoc exercises (negative ID), fetch history by name
  const currentActiveExercise = navigation.activeExercise;
  const isCurrentExerciseAdHoc = currentActiveExercise && currentActiveExercise.id < 0;
  const adHocExerciseName = isCurrentExerciseAdHoc ? currentActiveExercise.name : '';
  const { data: adHocHistory } = useExerciseHistoryByName(adHocExerciseName);

  // Get previous hint for an exercise - handles both regular and ad-hoc
  const getPreviousHintForExercise = (exercise: Exercise) => {
    if (exercise.id < 0 && adHocHistory && exercise.name === adHocExerciseName) {
      return {
        lastWeight: adHocHistory.sets[adHocHistory.sets.length - 1]?.weight || 0,
        lastReps: adHocHistory.sets[adHocHistory.sets.length - 1]?.reps || 0,
        sets: adHocHistory.sets,
      };
    }
    return exerciseHints.get(exercise.id);
  };

  // Calculate totals (only count standard sets for progress)
  const { totalSetsLogged, totalSetsTarget } = useMemo(() => {
    const logged = sets.filter(s => (s.dropIndex || 0) === 0).length;
    const target = exercises.reduce(
      (sum: number, ex: Exercise) => sum + getTargetSets(ex),
      0
    );
    return { totalSetsLogged: logged, totalSetsTarget: target };
  }, [sets, exercises]);

  const handleComplete = () => {
    if (!confirm('Finish this workout?')) return;

    // Calculate stats before completing
    const totalSetsCount = sets.filter(s => (s.dropIndex || 0) === 0).length;
    const totalVolumeCalc = sets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
    const sessionStartMs = session?.createdAt
      ? new Date(session.createdAt).getTime()
      : Date.now();
    const durationMins = Math.round((Date.now() - sessionStartMs) / 60000);
    const hrSeries = downsampleHr(samplesSince(sessionStartMs), sessionStartMs);
    const avgRpeValue = averageRpe(sets);

    completeSession(undefined, {
      onSuccess: () => {
        stopTimer();

        // Clear all session-scoped localStorage (nav, ad-hoc, ordering,
        // hidden, HR chart override, cardio persistence).
        clearSessionLocalState(sessionId);

        // Show celebration instead of navigating immediately
        setCelebrationData({
          totalSets: totalSetsCount,
          totalVolume: totalVolumeCalc,
          duration: durationMins,
          avgRpe: avgRpeValue,
          hrSeries,
        });
        setShowCelebration(true);
      },
    });
  };

  const discardMutation = useDiscardSession();

  const handleDiscard = () => {
    const count = sets.length;
    const detail = count > 0
      ? ` This will delete ${count} logged set${count !== 1 ? 's' : ''}.`
      : '';
    if (!confirm(`Discard this workout?${detail}`)) return;

    discardMutation.mutate(sessionId, {
      onSuccess: () => {
        stopTimer();
        navigate('/');
      },
    });
  };

  // Handler for adding an ad-hoc exercise to a program workout
  const handleAddExercise = (name: string) => {
    const virtualExercise = makeVirtualExercise({
      id: -Date.now(),
      name,
    });

    // Add to adHocProgramExercises (for reconstruction on session resume)
    setAdHocProgramExercises(prev => [...prev, virtualExercise]);

    // Insert AFTER the current step so user stays on current exercise
    const currentFlatIndex = navigation.flatIndexForStep(navigation.currentStepIndex);
    const currentStep = navigation.currentStep;
    const currentStepSize = currentStep
      ? (currentStep.type === 'single' ? 1 : currentStep.exercises.length)
      : 0;
    const insertPos = currentFlatIndex + currentStepSize;
    insertExerciseAt(virtualExercise, insertPos);

    if (navigation.isCurrentStepComplete) {
      pendingAdvanceStepRef.current = navigation.currentStepIndex + 1;
    }
  };

  // Handler for swapping an exercise mid-workout
  const handleSwapExercise = (exercise: Exercise, newName: string) => {
    const replacementExercise = makeVirtualExercise({
      id: -Date.now(),
      name: newName,
      targetSets: exercise.targetSets,
      targetReps: exercise.targetReps,
      orderIndex: exercise.orderIndex,
      supersetGroup: exercise.supersetGroup,
      exerciseType: exercise.exerciseType,
      cardioModality: exercise.cardioModality,
      targetDurationSec: exercise.targetDurationSec,
      targetDistance: exercise.targetDistance,
    });

    // Always in-place replacement — original's logged sets are preserved
    // in the database (history-independent via exerciseName on Set rows)
    swapExercise(exercise.id, replacementExercise);

    // Persist the replacement as ad-hoc
    setAdHocProgramExercises(prev => [...prev, replacementExercise]);
    setSwapTarget(null);
  };

  // Shared ExerciseCard wiring for the focused view (single + superset steps)
  const renderExerciseCard = (exercise: Exercise) => {
    const isExerciseAdHoc = exercise.id < 0;
    return (
      <ExerciseCard
        exercise={exercise}
        loggedSets={getSetsForExercise(exercise)}
        previousHint={getPreviousHintForExercise(exercise)}
        note={session?.exerciseNotes?.[exercise.name] ?? null}
        onLogSet={(data, opts) => {
          const exerciseIdForApi = isExerciseAdHoc ? null : exercise.id;
          handleLogSet({ ...data, exerciseId: exerciseIdForApi }, opts);
        }}
        onDeleteSet={deleteSet}
        onUpdateSet={updateSet}
        onSetNote={(note) => setExerciseNote(exercise.name, note)}
        onSwapExercise={() => setSwapTarget(exercise)}
        isLogging={isLoggingSet}
      />
    );
  };

  // "Up next" preview — the hook skips already-completed steps so the label
  // matches where goToNext() will actually land.
  const nextExercise = navigation.nextIncompleteExercise;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600
                        border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 dark:text-red-400 mb-4">
          Failed to load session
        </p>
        <Link to="/" className="text-primary-600 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  // Check if session is already completed
  if (session.completedAt) {
    // If we just completed it this session, keep the celebration modal mounted
    // until the user dismisses (otherwise the refetch unmounts it instantly).
    if (showCelebration && celebrationData) {
      return (
        <CompletionCelebration
          isOpen={true}
          workoutName={session.workoutName || 'Workout'}
          totalSets={celebrationData.totalSets}
          totalVolume={celebrationData.totalVolume}
          duration={celebrationData.duration}
          avgRpe={celebrationData.avgRpe}
          hrSeries={celebrationData.hrSeries}
          onDismiss={() => {
            setShowCelebration(false);
            navigate('/');
          }}
        />
      );
    }

    return <CompletedSessionSummary session={session} />;
  }

  return (
    <div className="pb-8">
      <SessionHeader
        session={session}
        totalSetsLogged={totalSetsLogged}
        totalSetsTarget={totalSetsTarget}
        onComplete={handleComplete}
        isCompleting={isCompletingSession}
        onToggleHrChart={toggleHrChart}
      />

      {hrChartVisible && (
        <LiveHRChart
          sessionStartMs={new Date(session.createdAt).getTime()}
          onClose={toggleHrChart}
        />
      )}

      {/* Focused exercise view (when session has workout exercises) */}
      {exercises.length > 0 && (
        <>
          {/* Current step exercises */}
          <div className="space-y-4">
            {navigation.currentStep?.type === 'single' &&
              renderExerciseCard(navigation.currentStep.exercise)}

            {navigation.currentStep?.type === 'superset' && (
              <SupersetStep
                exercises={navigation.currentStep.exercises}
                group={navigation.currentStep.group}
                activeIndex={navigation.supersetActiveIndex}
                isExerciseComplete={navigation.isExerciseComplete}
                getExerciseProgress={navigation.getExerciseProgress}
                onActivate={navigation.setSupersetActive}
                renderExerciseCard={renderExerciseCard}
              />
            )}
          </div>

          {/* Up next preview */}
          {nextExercise && (
            <div
              onClick={() => navigation.goToNext()}
              className="text-sm text-gray-500 dark:text-gray-400 py-3 px-4 mt-4 bg-gray-50 dark:bg-surface-800/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-surface-700/50 transition-colors"
            >
              Up next: <span className="font-medium text-gray-700 dark:text-gray-300">{nextExercise.name}</span>
              <span className="float-right text-primary-500">→</span>
            </div>
          )}

          {/* Exercise list dropdown (below up next) */}
          <div className="mt-4">
            <ExerciseListDropdown
              exercises={orderedExercises}
              currentStepIndex={navigation.flatIndexForStep(navigation.currentStepIndex)}
              getExerciseProgress={navigation.getExerciseProgress}
              isExerciseComplete={navigation.isExerciseComplete}
              onSelectExercise={(idx) => navigation.goToStep(navigation.stepForFlatIndex(idx))}
              onMoveExercise={handleMoveExercise}
            />
          </div>

          {/* Add Exercise for program workouts */}
          <div className="mt-4">
            <AddExercise onAdd={(ex) => handleAddExercise(ex.name)} />
          </div>
        </>
      )}

      {/* Blank ad-hoc sessions: show all exercises */}
      {exercises.length === 0 && (
        <div className="space-y-4">
          {allAdHocExercises.map((adHocEx) => {
            const adHocSets = adHocSetsByName.get(adHocEx.name.toLowerCase()) || [];
            const isCardio = isCardioExercise(adHocEx, adHocSets);

            const virtualExercise = makeVirtualExercise({
              id: -Math.abs(adHocEx.tempId.split('').reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0), 0)) - 1,
              name: adHocEx.name,
              targetSets: isCardio ? 1 : 3,
              exerciseType: isCardio ? 'cardio' : 'strength',
              cardioModality: adHocEx.cardioModality ?? null,
              targetDurationSec: adHocEx.targetDurationSec ?? null,
              targetDistance: adHocEx.targetDistance ?? null,
            });

            return (
              <ExerciseCard
                key={adHocEx.tempId}
                exercise={virtualExercise}
                loggedSets={adHocSets}
                note={session?.exerciseNotes?.[virtualExercise.name] ?? null}
                onLogSet={(data, opts) => handleLogSet({ ...data, exerciseId: null }, opts)}
                onDeleteSet={deleteSet}
                onUpdateSet={updateSet}
                onSetNote={(note) => setExerciseNote(virtualExercise.name, note)}
                isLogging={isLoggingSet}
              />
            );
          })}

          {/* Add Exercise button for ad-hoc sessions */}
          <AddExercise
            onAdd={(exercise) => setAdHocExercises(prev => [...prev, exercise])}
          />
        </div>
      )}

      {/* Discard session — escape hatch without going Home → Resume card */}
      <div className="mt-8 text-center">
        <button
          onClick={handleDiscard}
          disabled={discardMutation.isPending}
          className="min-h-[44px] px-4 text-sm font-medium text-red-600 dark:text-red-400
                     hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
        >
          {discardMutation.isPending ? 'Discarding...' : 'Discard Workout'}
        </button>
      </div>

      {/* Swap Exercise Modal */}
      <SwapExercise
        isOpen={swapTarget !== null}
        currentExerciseName={swapTarget?.name || ''}
        onSwap={(newName) => {
          if (swapTarget) handleSwapExercise(swapTarget, newName);
        }}
        onCancel={() => setSwapTarget(null)}
      />

      {/* RPE Prompt Modal */}
      <RpePrompt
        isOpen={rpePromptExercise !== null}
        exerciseName={rpePromptExercise?.name || ''}
        onSubmit={handleRpeSubmit}
        onSkip={handleRpeSkip}
      />

      {/* Completion Celebration */}
      <CompletionCelebration
        isOpen={showCelebration}
        workoutName={session?.workoutName || 'Workout'}
        totalSets={celebrationData?.totalSets || 0}
        totalVolume={celebrationData?.totalVolume || 0}
        duration={celebrationData?.duration || 0}
        avgRpe={celebrationData?.avgRpe ?? null}
        hrSeries={celebrationData?.hrSeries || null}
        onDismiss={() => {
          setShowCelebration(false);
          navigate('/');
        }}
      />
    </div>
  );
}
