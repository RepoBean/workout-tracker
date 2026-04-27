import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useActiveSession } from './hooks/useActiveSession';
import { usePreviousData } from './hooks/usePreviousData';
import { useExerciseNavigation, getNavStorageKeys } from './hooks/useExerciseNavigation';
import { useAdHocExercises, getAdHocStorageKey } from './hooks/useAdHocExercises';
import { useExerciseOrdering, getOrderStorageKey, getHiddenStorageKey } from './hooks/useExerciseOrdering';
import { useRpeFlow } from './hooks/useRpeFlow';
import { useExerciseHistoryByName } from '../../shared/api/queries';
import { SessionHeader } from './components/SessionHeader';
import { ExerciseCard } from './components/ExerciseCard';
import { ExerciseListDropdown } from './components/ExerciseListDropdown';
import { AddExercise } from './components/AddExercise';
import { SwapExercise } from './components/SwapExercise';
import { RpePrompt } from './components/RpePrompt';
import { CompletionCelebration } from './components/CompletionCelebration';
import { LiveHRChart } from './components/LiveHRChart';
import { useTimer } from '../../shared/context/TimerContext';
import { useHeartRate } from '../../shared/context/HeartRateContext';
import { downsampleHr } from '../../shared/utils/heartRate';
import { getTargetSets, isCardioExercise, isCardioSet } from '../../shared/api/predicates';
import type { CardioModality, Exercise } from '../../shared/api/types';

const CARDIO_LABELS: Record<CardioModality, string> = {
  running: 'Run',
  cycling: 'Ride',
  treadmill: 'Treadmill',
  rowing: 'Row',
  other: 'Cardio',
};

const getHrChartStorageKey = (sessionId: number) => `wt:livehr:visible:${sessionId}`;

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
    if (!modality || !CARDIO_LABELS[modality]) return;
    setAdHocExercises(prev => {
      if (prev.some(e => isCardioExercise(e))) return prev;
      return [...prev, {
        tempId: `adhoc-cardio-${Date.now()}`,
        name: CARDIO_LABELS[modality],
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

  // Celebration state
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{
    totalSets: number;
    totalVolume: number;
    duration: number;
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

  // RPE flow management
  const {
    rpePromptExercise,
    handleSetLogged,
    handleRpeSubmit,
    handleRpeSkip,
  } = useRpeFlow({
    navigation,
    mergedExercises,
    updateSetsEffort,
  });

  // Wire up set logging callback
  const handleLogSet = (data: Parameters<typeof logSet>[0]) => {
    logSet(data, {
      onSuccess: () => {
        handleSetLogged(data.exerciseId ?? null, data.exerciseName, data.dropIndex ?? 0);
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

    completeSession(undefined, {
      onSuccess: () => {
        stopTimer();

        // Clear navigation state
        const navKeys = getNavStorageKeys(sessionId);
        localStorage.removeItem(navKeys.step);
        localStorage.removeItem(navKeys.superset);

        // Clear ad-hoc exercise persistence
        localStorage.removeItem(getAdHocStorageKey(sessionId));

        // Clear exercise ordering
        localStorage.removeItem(getOrderStorageKey(sessionId));

        // Clear hidden exercises (from swaps)
        localStorage.removeItem(getHiddenStorageKey(sessionId));

        // Clear live HR chart visibility override
        localStorage.removeItem(getHrChartStorageKey(sessionId));

        // Show celebration instead of navigating immediately
        setCelebrationData({
          totalSets: totalSetsCount,
          totalVolume: totalVolumeCalc,
          duration: durationMins,
          hrSeries,
        });
        setShowCelebration(true);
      },
    });
  };

  // Handler for adding an ad-hoc exercise to a program workout
  const handleAddExercise = (name: string) => {
    const virtualExercise: Exercise = {
      id: -Date.now(),
      workoutId: 0,
      name,
      targetSets: 3,
      targetReps: '10',
      orderIndex: 0,
      supersetGroup: null,
      exerciseType: 'strength',
      cardioModality: null,
      targetDurationSec: null,
      targetDistance: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add to adHocProgramExercises (for reconstruction on session resume)
    setAdHocProgramExercises(prev => [...prev, virtualExercise]);

    // Insert AFTER the current step so user stays on current exercise
    const currentFlatIndex = navigation.getCurrentFlatIndex();
    const currentStep = navigation.currentStep;
    const currentStepSize = currentStep
      ? (currentStep.type === 'single' ? 1 : currentStep.exercises.length)
      : 0;
    const insertPos = currentFlatIndex + currentStepSize;
    insertExerciseAt(virtualExercise, insertPos);
  };

  // Handler for swapping an exercise mid-workout
  const handleSwapExercise = (exercise: Exercise, newName: string) => {
    const replacementExercise: Exercise = {
      id: -Date.now(),
      workoutId: 0,
      name: newName,
      targetSets: exercise.targetSets,
      targetReps: exercise.targetReps,
      orderIndex: exercise.orderIndex,
      supersetGroup: exercise.supersetGroup,
      exerciseType: exercise.exerciseType,
      cardioModality: exercise.cardioModality,
      targetDurationSec: exercise.targetDurationSec,
      targetDistance: exercise.targetDistance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Always in-place replacement — original's logged sets are preserved
    // in the database (history-independent via exerciseName on Set rows)
    swapExercise(exercise.id, replacementExercise);

    // Persist the replacement as ad-hoc
    setAdHocProgramExercises(prev => [...prev, replacementExercise]);
    setSwapTarget(null);
  };

  // Find exercise index in flat list for dropdown navigation
  const getExerciseIndexInList = (stepIndex: number): number => {
    let idx = 0;
    for (let i = 0; i < stepIndex && i < navigation.steps.length; i++) {
      const step = navigation.steps[i];
      if (step.type === 'single') {
        idx++;
      } else {
        idx += step.exercises.length;
      }
    }
    return idx;
  };

  // Get next exercise for "Up next" preview — skip already-completed steps
  // so the label matches where goToNext() will actually land.
  const getNextExercise = (): Exercise | null => {
    for (let i = navigation.currentStepIndex + 1; i < navigation.steps.length; i++) {
      const step = navigation.steps[i];
      const complete = step.type === 'single'
        ? navigation.isExerciseComplete(step.exercise.id)
        : step.exercises.every(ex => navigation.isExerciseComplete(ex.id));
      if (!complete) {
        return step.type === 'single' ? step.exercise : step.exercises[0];
      }
    }
    return null;
  };
  const nextExercise = getNextExercise();

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
    // Calculate session stats
    const completedSets = sets.filter(s => (s.dropIndex || 0) === 0);
    const completedTotalSets = completedSets.length;
    const completedTotalVolume = sets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
    const completedDuration = session.createdAt
      ? Math.round((new Date(session.completedAt).getTime() - new Date(session.createdAt).getTime()) / 60000)
      : 0;

    const formatVolume = (v: number) => {
      if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
      return String(v);
    };

    return (
      <div className="text-center py-12 px-4">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full
                       flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none"
            viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-1">{session.workoutName}</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Completed on {new Date(session.completedAt).toLocaleDateString()}
        </p>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 mb-6 max-w-xs mx-auto">
          <div className="bg-gray-50 dark:bg-surface-800 rounded-lg p-3">
            <p className="text-2xl font-display font-bold">{completedTotalSets}</p>
            <p className="text-xs text-gray-500">Sets</p>
          </div>
          <div className="bg-gray-50 dark:bg-surface-800 rounded-lg p-3">
            <p className="text-2xl font-display font-bold">{formatVolume(completedTotalVolume)}</p>
            <p className="text-xs text-gray-500">lbs</p>
          </div>
          <div className="bg-gray-50 dark:bg-surface-800 rounded-lg p-3">
            <p className="text-2xl font-display font-bold">{completedDuration}</p>
            <p className="text-xs text-gray-500">min</p>
          </div>
        </div>

        <div className="space-x-4">
          <Link to="/history" className="text-primary-600 hover:underline">
            View History
          </Link>
          <Link to="/" className="text-primary-600 hover:underline">
            Dashboard
          </Link>
        </div>
      </div>
    );
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
            {navigation.currentStep?.type === 'single' && (() => {
              const exercise = navigation.currentStep.exercise;
              const isExerciseAdHoc = exercise.id < 0;
              return (
                <ExerciseCard
                  exercise={exercise}
                  loggedSets={getSetsForExercise(exercise)}
                  previousHint={getPreviousHintForExercise(exercise)}
                  onLogSet={(data) => {
                    const exerciseIdForApi = isExerciseAdHoc ? null : exercise.id;
                    handleLogSet({ ...data, exerciseId: exerciseIdForApi });
                  }}
                  onDeleteSet={deleteSet}
                  onUpdateSet={updateSet}
                  onSwapExercise={() => setSwapTarget(exercise)}
                  isLogging={isLoggingSet}
                />
              );
            })()}

            {navigation.currentStep?.type === 'superset' && (() => {
              const supersetExercises = navigation.currentStep.exercises;
              const activeIdx = navigation.supersetActiveIndex % supersetExercises.length;

              // Reorder so active exercise is first
              const reorderedExercises = [
                supersetExercises[activeIdx],
                ...supersetExercises.filter((_, idx) => idx !== activeIdx)
              ];

              return (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-purple-600 dark:text-purple-400 
                               px-3 py-1 bg-purple-100 dark:bg-purple-900/30 rounded-lg inline-block">
                    Superset {navigation.currentStep.group}
                  </div>
                  {reorderedExercises.map((exercise, displayIdx) => {
                    const isActive = displayIdx === 0; // First is always active
                    const isComplete = navigation.isExerciseComplete(exercise.id);

                    return (
                      <div
                        key={exercise.id}
                        className={`transition-all ${isActive
                          ? ''
                          : isComplete
                            ? 'opacity-60 scale-[0.98]'
                            : 'opacity-75'
                          }`}
                      >
                        {isActive ? (() => {
                          const isExerciseAdHoc = exercise.id < 0;
                          return (
                            <ExerciseCard
                              exercise={exercise}
                              loggedSets={getSetsForExercise(exercise)}
                              previousHint={getPreviousHintForExercise(exercise)}
                              onLogSet={(data) => {
                                const exerciseIdForApi = isExerciseAdHoc ? null : exercise.id;
                                handleLogSet({ ...data, exerciseId: exerciseIdForApi });
                              }}
                              onDeleteSet={deleteSet}
                              onUpdateSet={updateSet}
                              onSwapExercise={() => setSwapTarget(exercise)}
                              isLogging={isLoggingSet}
                            />
                          );
                        })() : (
                          // Collapsed view for non-active superset exercises
                          <div
                            className={`card py-3 px-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${isComplete ? 'ring-2 ring-green-500 dark:ring-green-400' : ''
                              }`}
                            onClick={() => {
                              // Click to switch to this exercise
                              const originalIdx = supersetExercises.findIndex(e => e.id === exercise.id);
                              const diff = originalIdx - activeIdx;
                              for (let i = 0; i < Math.abs(diff); i++) {
                                navigation.rotateSupersetActive();
                              }
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-medium">{exercise.name}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {(() => {
                                    const p = navigation.getExerciseProgress(exercise.id);
                                    const unit = isCardioExercise(exercise) ? 'effort' : 'sets';
                                    return `${p.logged}/${p.target} ${unit}`;
                                  })()}
                                </p>
                              </div>
                              {isComplete && (
                                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Up next preview */}
          {nextExercise && (
            <div
              onClick={() => navigation.goToNext()}
              className="text-sm text-gray-500 dark:text-gray-400 py-3 px-4 mt-4 bg-gray-50 dark:bg-surface-800/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              Up next: <span className="font-medium text-gray-700 dark:text-gray-300">{nextExercise.name}</span>
              <span className="float-right text-primary-500">→</span>
            </div>
          )}

          {/* Exercise list dropdown (below up next) */}
          <div className="mt-4">
            <ExerciseListDropdown
              exercises={orderedExercises}
              currentStepIndex={getExerciseIndexInList(navigation.currentStepIndex)}
              getExerciseProgress={navigation.getExerciseProgress}
              isExerciseComplete={navigation.isExerciseComplete}
              onSelectExercise={(idx) => {
                // Find step containing this exercise
                let count = 0;
                for (let i = 0; i < navigation.steps.length; i++) {
                  const step = navigation.steps[i];
                  const stepSize = step.type === 'single' ? 1 : step.exercises.length;
                  if (idx < count + stepSize) {
                    navigation.goToStep(i);
                    return;
                  }
                  count += stepSize;
                }
              }}
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

            const virtualExercise: Exercise = {
              id: -Math.abs(adHocEx.tempId.split('').reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0), 0)) - 1,
              workoutId: 0,
              name: adHocEx.name,
              targetSets: isCardio ? 1 : 3,
              targetReps: '10',
              orderIndex: 0,
              supersetGroup: null,
              exerciseType: isCardio ? 'cardio' : 'strength',
              cardioModality: adHocEx.cardioModality ?? null,
              targetDurationSec: adHocEx.targetDurationSec ?? null,
              targetDistance: adHocEx.targetDistance ?? null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            return (
              <ExerciseCard
                key={adHocEx.tempId}
                exercise={virtualExercise}
                loggedSets={adHocSets}
                onLogSet={(data) => handleLogSet({ ...data, exerciseId: null })}
                onDeleteSet={deleteSet}
                onUpdateSet={updateSet}
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
        hrSeries={celebrationData?.hrSeries || null}
        onDismiss={() => {
          setShowCelebration(false);
          navigate('/');
        }}
      />
    </div>
  );
}
