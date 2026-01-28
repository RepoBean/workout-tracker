import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useActiveSession } from './hooks/useActiveSession';
import { usePreviousData } from './hooks/usePreviousData';
import { useExerciseNavigation } from './hooks/useExerciseNavigation';
import { SessionHeader } from './components/SessionHeader';
import { ExerciseCard } from './components/ExerciseCard';
import { ExerciseListDropdown } from './components/ExerciseListDropdown';
import { RestTimer } from './components/RestTimer';
import { SetInput } from './components/SetInput';
import { AddExercise } from './components/AddExercise';
import { RpePrompt } from './components/RpePrompt';
import { SwipeableRow } from '../../shared/ui/SwipeableRow';
import { Button } from '../../shared/ui/Button';
import type { Set, Exercise } from '../../shared/api/types';
import type { AdHocExercise } from './components/AddExercise';

export default function ActiveSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sessionId = Number(id);
  const [adHocExercises, setAdHocExercises] = useState<AdHocExercise[]>([]);

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

  const { exerciseHints } = usePreviousData(sessionId);

  const isAdHoc = session?.isAdHoc || false;
  const exercises = session?.exercises || [];
  const sets = session?.sets || [];

  // Exercise navigation hook for focused view (non-ad-hoc sessions only)
  const navigation = useExerciseNavigation({
    exercises,
    sets,
  });

  // Track previous set count to detect new set logged
  const [prevSetCount, setPrevSetCount] = useState(sets.length);

  // Auto-rotate superset and auto-advance when sets are logged
  useEffect(() => {
    if (sets.length > prevSetCount) {
      // A new set was logged
      if (navigation.currentStep?.type === 'superset') {
        // Check if current active exercise is now complete
        if (navigation.activeExercise && navigation.isExerciseComplete(navigation.activeExercise.id)) {
          // Check if all exercises in superset are complete
          if (navigation.isCurrentStepComplete) {
            navigation.goToNext();
          } else {
            navigation.rotateSupersetActive();
          }
        } else {
          // Rotate to next exercise in superset
          navigation.rotateSupersetActive();
        }
      } else if (navigation.isCurrentStepComplete) {
        // Single exercise complete, show RPE prompt then auto-advance
        if (navigation.activeExercise) {
          setRpePromptExercise({
            id: navigation.activeExercise.id,
            name: navigation.activeExercise.name
          });
        }
      }
    }
    setPrevSetCount(sets.length);
  }, [sets.length, prevSetCount, navigation]);

  // Group sets by exercise ID, sorted by setNumber then dropIndex
  const setsByExercise = useMemo(() => {
    const map = new Map<number, Set[]>();
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
    const map = new Map<string, Set[]>();
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
    <div className="pb-32">
      <SessionHeader
        session={session}
        totalSetsLogged={totalSetsLogged}
        totalSetsTarget={totalSetsTarget}
        onComplete={handleComplete}
        isCompleting={isCompletingSession}
      />

      <RestTimer />

      {/* Non-ad-hoc: Focused exercise view */}
      {!isAdHoc && exercises.length > 0 && (
        <>
          {/* Current step exercises */}
          <div className="space-y-4">
            {navigation.currentStep?.type === 'single' && (
              <ExerciseCard
                exercise={navigation.currentStep.exercise}
                loggedSets={setsByExercise.get(navigation.currentStep.exercise.id) || []}
                previousHint={exerciseHints.get(navigation.currentStep.exercise.id)}
                onLogSet={logSet}
                onDeleteSet={deleteSet}
                onUpdateSet={updateSet}
                isLogging={isLoggingSet}
              />
            )}

            {navigation.currentStep?.type === 'superset' && (() => {
              const supersetExercises = navigation.currentStep.exercises;
              return (
                <div className="space-y-4">
                  <div className="text-sm font-medium text-purple-600 dark:text-purple-400 
                               px-3 py-1 bg-purple-100 dark:bg-purple-900/30 rounded-lg inline-block">
                    Superset {navigation.currentStep.group}
                  </div>
                  {supersetExercises.map((exercise, idx) => {
                    const isActive = idx === navigation.supersetActiveIndex % supersetExercises.length;
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
                        {isActive ? (
                          <ExerciseCard
                            exercise={exercise}
                            loggedSets={setsByExercise.get(exercise.id) || []}
                            previousHint={exerciseHints.get(exercise.id)}
                            onLogSet={logSet}
                            onDeleteSet={deleteSet}
                            isLogging={isLoggingSet}
                          />
                        ) : (
                          // Collapsed view for non-active superset exercises
                          <div
                            className={`card py-3 px-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${isComplete ? 'ring-2 ring-green-500 dark:ring-green-400' : ''
                              }`}
                            onClick={() => {
                              // Allow clicking to make this the active exercise
                              const diff = idx - (navigation.supersetActiveIndex % supersetExercises.length);
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

          {/* Exercise list dropdown (below active exercise) */}
          <ExerciseListDropdown
            exercises={exercises}
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

          {/* Navigation footer */}
          <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t 
                         border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              onClick={navigation.goToPrevious}
              disabled={navigation.currentStepIndex === 0}
              className="w-24"
            >
              ← Previous
            </Button>

            <span className="text-sm text-gray-600 dark:text-gray-400">
              Exercise {navigation.currentStepIndex + 1} of {navigation.steps.length}
            </span>

            <Button
              variant="secondary"
              size="sm"
              onClick={navigation.goToNext}
              disabled={navigation.currentStepIndex >= navigation.steps.length - 1}
              className="w-24"
            >
              Next →
            </Button>
          </div>
        </>
      )}

      {/* Ad-hoc sessions: show all exercises */}
      {isAdHoc && (
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

                {/* Set input for next set */}
                <SetInput
                  exerciseId={null}
                  exerciseName={adHocEx.name}
                  setNumber={nextSetNumber}
                  previousWeight={lastSet?.weight || 0}
                  previousReps={lastSet?.reps || 10}
                  onLogSet={logSet}
                  isLogging={isLoggingSet}
                />
              </div>
            );
          })}

          {/* Add Exercise button for ad-hoc sessions */}
          <AddExercise
            onAdd={(exercise) => setAdHocExercises(prev => [...prev, exercise])}
          />
        </div>
      )}

      {/* Empty state for non-ad-hoc sessions with no exercises */}
      {!isAdHoc && exercises.length === 0 && (
        <div className="card text-center text-gray-500 dark:text-gray-400 py-8">
          <p>No exercises in this workout</p>
          <Link to="/" className="text-primary-600 hover:underline mt-2 inline-block">
            Return to Dashboard
          </Link>
        </div>
      )}
      {/* RPE Prompt Modal */}
      <RpePrompt
        isOpen={rpePromptExercise !== null}
        exerciseName={rpePromptExercise?.name || ''}
        onSubmit={(rpe) => {
          if (rpePromptExercise) {
            updateSetsEffort(rpePromptExercise.id, rpe);
          }
          setRpePromptExercise(null);
          navigation.goToNext();
        }}
        onSkip={() => {
          setRpePromptExercise(null);
          navigation.goToNext();
        }}
      />
    </div>
  );
}
