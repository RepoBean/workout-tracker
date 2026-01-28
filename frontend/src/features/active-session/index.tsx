import { useMemo, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useActiveSession } from './hooks/useActiveSession';
import { usePreviousData } from './hooks/usePreviousData';
import { useExerciseNavigation } from './hooks/useExerciseNavigation';
import { useExerciseHistoryByName } from '../../shared/api/queries';
import { SessionHeader } from './components/SessionHeader';
import { ExerciseCard } from './components/ExerciseCard';
import { ExerciseListDropdown } from './components/ExerciseListDropdown';
import { RestTimer } from './components/RestTimer';
import { AddExercise } from './components/AddExercise';
import { RpePrompt } from './components/RpePrompt';
import { SwipeableRow } from '../../shared/ui/SwipeableRow';
import type { Set as SetType, Exercise } from '../../shared/api/types';
import type { AdHocExercise } from './components/AddExercise';

export default function ActiveSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sessionId = Number(id);
  const [adHocExercises, setAdHocExercises] = useState<AdHocExercise[]>([]);

  // State for ad-hoc exercises added to program workouts (virtual exercises with negative IDs)
  const [adHocProgramExercises, setAdHocProgramExercises] = useState<Exercise[]>([]);

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

  // Per-exercise RPE prompt state
  const [rpePromptExercise, setRpePromptExercise] = useState<{ id: number; name: string } | null>(null);

  // Track which exercises have been completed (for superset RPE fix)
  const completedExercisesRef = useRef<Set<number>>(new Set());

  const { exerciseHints } = usePreviousData(sessionId);

  const exercises = session?.exercises || [];
  const sets = session?.sets || [];

  // Group sets by exercise ID, sorted by setNumber then dropIndex
  const setsByExercise = useMemo(() => {
    const map = new Map<number, SetType[]>();
    for (const set of sets) {
      if (set.exerciseId) {
        const existing = map.get(set.exerciseId) || [];
        map.set(set.exerciseId, [...existing, set].sort(
          (a, b) => a.setNumber - b.setNumber || (a.dropIndex || 0) - (b.dropIndex || 0)
        ));
      }
    }
    return map;
  }, [sets]);

  // Group ad-hoc sets by exerciseName (for ad-hoc sessions with exerciseId=null)
  const adHocSetsByName = useMemo(() => {
    const map = new Map<string, SetType[]>();
    for (const set of sets) {
      if (!set.exerciseId) {
        const existing = map.get(set.exerciseName) || [];
        map.set(set.exerciseName, [...existing, set].sort(
          (a, b) => a.setNumber - b.setNumber || (a.dropIndex || 0) - (b.dropIndex || 0)
        ));
      }
    }
    return map;
  }, [sets]);

  // Reconstruct ad-hoc exercises added to program workouts from sets
  const reconstructedAdHocExercises = useMemo(() => {
    if (exercises.length === 0) return []; // Blank ad-hoc sessions handled elsewhere

    const programExerciseNames = new Set(exercises.map(e => e.name.toLowerCase()));
    const result: Exercise[] = [];

    for (const [name] of adHocSetsByName.entries()) {
      // Skip if this name matches a program exercise
      if (programExerciseNames.has(name.toLowerCase())) continue;

      // Create virtual exercise from the set data
      result.push({
        id: -name.length - Date.now() % 1000, // Stable-ish negative ID
        workoutId: session?.workoutId || 0,
        name,
        targetSets: 3,
        targetReps: '10',
        orderIndex: exercises.length + result.length,
        supersetGroup: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return result;
  }, [exercises, adHocSetsByName, session?.workoutId]);

  // Merge program exercises with ad-hoc program exercises for navigation
  const mergedExercises = useMemo(() => {
    // Combine: program exercises + reconstructed ad-hoc + newly added ad-hoc
    const reconstructedNames = new Set(reconstructedAdHocExercises.map(e => e.name.toLowerCase()));
    const newAdHoc = adHocProgramExercises.filter(
      e => !reconstructedNames.has(e.name.toLowerCase())
    );
    return [...exercises, ...reconstructedAdHocExercises, ...newAdHoc];
  }, [exercises, reconstructedAdHocExercises, adHocProgramExercises]);

  // Exercise navigation hook for focused view (non-ad-hoc sessions only)
  const navigation = useExerciseNavigation({
    exercises: mergedExercises,
    sets,
  });

  // For ad-hoc exercises (negative ID), fetch history by name
  const currentActiveExercise = navigation.activeExercise;
  const isCurrentExerciseAdHoc = currentActiveExercise && currentActiveExercise.id < 0;
  const adHocExerciseName = isCurrentExerciseAdHoc ? currentActiveExercise.name : '';
  const { data: adHocHistory } = useExerciseHistoryByName(adHocExerciseName);

  // Get previous hint for an exercise - handles both regular and ad-hoc
  const getPreviousHintForExercise = (exercise: Exercise) => {
    if (exercise.id < 0 && adHocHistory && exercise.name === adHocExerciseName) {
      // Ad-hoc exercise with history data
      return {
        lastWeight: adHocHistory.sets[adHocHistory.sets.length - 1]?.weight || 0,
        lastReps: adHocHistory.sets[adHocHistory.sets.length - 1]?.reps || 0,
        sets: adHocHistory.sets,
      };
    }
    return exerciseHints.get(exercise.id);
  };

  // Get sets for an exercise - handles both regular (by ID) and ad-hoc (by name)
  const getSetsForExercise = (exercise: Exercise): SetType[] => {
    if (exercise.id < 0) {
      // Ad-hoc exercise: look up by name in adHocSetsByName
      return adHocSetsByName.get(exercise.name) || [];
    }
    return setsByExercise.get(exercise.id) || [];
  };

  // Track previous set count to detect new set logged
  const [prevSetCount, setPrevSetCount] = useState(sets.length);

  // Auto-rotate superset and auto-advance when sets are logged
  // FIXED: Show RPE prompt for ANY exercise completion, including supersets
  useEffect(() => {
    if (sets.length > prevSetCount && navigation.activeExercise) {
      const exerciseId = navigation.activeExercise.id;
      const wasComplete = completedExercisesRef.current.has(exerciseId);
      const isNowComplete = navigation.isExerciseComplete(exerciseId);

      // Check if this exercise just completed
      if (!wasComplete && isNowComplete) {
        // Mark as completed
        completedExercisesRef.current.add(exerciseId);

        // Show RPE prompt for completed exercise
        setRpePromptExercise({
          id: exerciseId,
          name: navigation.activeExercise.name
        });
        setPrevSetCount(sets.length);
        return; // Wait for RPE before navigating
      }

      // Not newly complete — handle rotation/advance
      if (navigation.currentStep?.type === 'superset') {
        if (navigation.isCurrentStepComplete) {
          navigation.goToNext();
        } else {
          navigation.rotateSupersetActive();
        }
      } else if (navigation.isCurrentStepComplete) {
        navigation.goToNext();
      }
    }
    setPrevSetCount(sets.length);
  }, [sets.length, prevSetCount, navigation]);

  // RPE submit handler - navigate AFTER RPE
  const handleRpeSubmit = (rpe: number) => {
    if (rpePromptExercise) {
      updateSetsEffort(rpePromptExercise.id, rpe);
    }
    setRpePromptExercise(null);

    // Navigate after RPE
    if (navigation.currentStep?.type === 'superset') {
      if (navigation.isCurrentStepComplete) {
        navigation.goToNext();
      } else {
        navigation.rotateSupersetActive();
      }
    } else {
      navigation.goToNext();
    }
  };

  const handleRpeSkip = () => {
    setRpePromptExercise(null);

    // Navigate after skip
    if (navigation.currentStep?.type === 'superset') {
      if (navigation.isCurrentStepComplete) {
        navigation.goToNext();
      } else {
        navigation.rotateSupersetActive();
      }
    } else {
      navigation.goToNext();
    }
  };



  // Merge ad-hoc exercises from state with those derived from logged sets
  const allAdHocExercises = useMemo(() => {
    const names = new Set<string>();
    const result: AdHocExercise[] = [];
    for (const name of adHocSetsByName.keys()) {
      if (!names.has(name)) {
        names.add(name);
        result.push({ tempId: `logged-${name}`, name });
      }
    }
    for (const ex of adHocExercises) {
      if (!names.has(ex.name)) {
        names.add(ex.name);
        result.push(ex);
      }
    }
    return result;
  }, [adHocSetsByName, adHocExercises]);

  // Calculate totals (only count standard sets for progress)
  const { totalSetsLogged, totalSetsTarget } = useMemo(() => {
    const logged = sets.filter(s => (s.dropIndex || 0) === 0).length;
    const target = exercises.reduce(
      (sum: number, ex: Exercise) => sum + ex.targetSets,
      0
    );
    return { totalSetsLogged: logged, totalSetsTarget: target };
  }, [sets, exercises]);

  const handleComplete = () => {
    completeSession(undefined, {
      onSuccess: () => {
        navigate('/');
      },
    });
  };

  // Handler for adding an ad-hoc exercise to a program workout
  const handleAddExercise = (name: string) => {
    // Create virtual exercise with negative ID to identify as ad-hoc
    const virtualExercise: Exercise = {
      id: -Date.now(),
      workoutId: 0,
      name,
      targetSets: 3,
      targetReps: '10',
      orderIndex: navigation.currentStepIndex,
      supersetGroup: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setAdHocProgramExercises(prev => [...prev, virtualExercise]);
    navigation.insertExercise(virtualExercise);
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

  // Get next exercise for "Up next" preview
  const getNextExercise = (): Exercise | null => {
    const nextStep = navigation.steps[navigation.currentStepIndex + 1];
    if (!nextStep) return null;
    return nextStep.type === 'single' ? nextStep.exercise : nextStep.exercises[0];
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
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full
                       flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none"
            viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Session Completed</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          This workout was completed on {new Date(session.completedAt).toLocaleDateString()}
        </p>
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
      />

      <RestTimer />

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
                    // For ad-hoc exercises, use null exerciseId
                    const exerciseIdForApi = isExerciseAdHoc ? null : exercise.id;
                    logSet({ ...data, exerciseId: exerciseIdForApi });
                  }}
                  onDeleteSet={deleteSet}
                  onUpdateSet={updateSet}
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
                                logSet({ ...data, exerciseId: exerciseIdForApi });
                              }}
                              onDeleteSet={deleteSet}
                              onUpdateSet={updateSet}
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
                                  {navigation.getExerciseProgress(exercise.id).logged}/{exercise.targetSets} sets
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
            <div className="text-sm text-gray-500 dark:text-gray-400 py-3 px-4 mt-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              Up next: <span className="font-medium text-gray-700 dark:text-gray-300">{nextExercise.name}</span>
            </div>
          )}

          {/* Exercise list dropdown (below up next) */}
          <div className="mt-4">
            <ExerciseListDropdown
              exercises={mergedExercises}
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
              onMoveExercise={navigation.moveExercise}
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
            const adHocSets = adHocSetsByName.get(adHocEx.name) || [];
            const standardSets = adHocSets.filter(s => (s.dropIndex || 0) === 0);
            const nextSetNumber = standardSets.length + 1;
            const lastSet = standardSets.length > 0
              ? standardSets[standardSets.length - 1]
              : undefined;

            return (
              <div key={adHocEx.tempId} className="card">
                <h3 className="font-semibold text-lg mb-3">{adHocEx.name}</h3>

                {/* Logged sets */}
                {adHocSets.length > 0 && (
                  <div className="mb-4 space-y-1">
                    {adHocSets.map((set) => (
                      <SwipeableRow
                        key={set.id}
                        onSwipeLeft={() => deleteSet(set.id)}
                        disabled={set.id < 0}
                      >
                        <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${(set.dropIndex || 0) > 0
                          ? 'bg-orange-50 dark:bg-orange-900/20 ml-4 mt-1'
                          : 'bg-green-50 dark:bg-green-900/20'
                          }`}>
                          <span className={`text-sm font-medium ${(set.dropIndex || 0) > 0
                            ? 'text-orange-700 dark:text-orange-300'
                            : 'text-green-800 dark:text-green-300'
                            }`}>
                            {(set.dropIndex || 0) > 0
                              ? `↳ Drop ${set.dropIndex}`
                              : `Set ${set.setNumber}`}
                          </span>
                          <span className={`font-semibold ${(set.dropIndex || 0) > 0
                            ? 'text-orange-800 dark:text-orange-200 text-sm'
                            : 'text-green-900 dark:text-green-200'
                            }`}>
                            {set.weight} lbs x {set.reps}
                            {set.perceivedEffort && (
                              <span className="ml-2 text-sm text-gray-500">
                                RPE {set.perceivedEffort}
                              </span>
                            )}
                          </span>
                        </div>
                      </SwipeableRow>
                    ))}
                  </div>
                )}

                {/* Set input for next set - import SetInput for ad-hoc */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Set {nextSetNumber}
                  </div>
                  <div className="text-sm text-gray-400 mb-2">
                    Last: {lastSet ? `${lastSet.weight} lbs × ${lastSet.reps}` : '—'}
                  </div>
                  {/* Simplified inline logging for ad-hoc */}
                  <button
                    onClick={() => logSet({
                      exerciseId: null,
                      exerciseName: adHocEx.name,
                      weight: lastSet?.weight || 0,
                      reps: lastSet?.reps || 10,
                      setNumber: nextSetNumber,
                    })}
                    className="w-full py-2 bg-primary-600 text-white rounded-lg font-medium"
                    disabled={isLoggingSet}
                  >
                    Log Set {nextSetNumber}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add Exercise button for ad-hoc sessions */}
          <AddExercise
            onAdd={(exercise) => setAdHocExercises(prev => [...prev, exercise])}
          />
        </div>
      )}



      {/* RPE Prompt Modal */}
      <RpePrompt
        isOpen={rpePromptExercise !== null}
        exerciseName={rpePromptExercise?.name || ''}
        onSubmit={handleRpeSubmit}
        onSkip={handleRpeSkip}
      />
    </div>
  );
}
