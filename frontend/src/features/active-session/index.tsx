import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useActiveSession } from './hooks/useActiveSession';
import { usePreviousData } from './hooks/usePreviousData';
import { SessionHeader } from './components/SessionHeader';
import { ExerciseCard } from './components/ExerciseCard';
import { RestTimer } from './components/RestTimer';
import { SetInput } from './components/SetInput';
import { AddExercise } from './components/AddExercise';
import { SwipeableRow } from '../../shared/ui/SwipeableRow';
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
    deleteSet,
    completeSession,
    isCompletingSession,
  } = useActiveSession(sessionId);

  const { exerciseHints } = usePreviousData(sessionId);

  const isAdHoc = session?.isAdHoc || false;

  // Group sets by exercise ID, sorted by setNumber then dropIndex
  const setsByExercise = useMemo(() => {
    const map = new Map<number, Set[]>();
    for (const set of session?.sets || []) {
      if (set.exerciseId) {
        const existing = map.get(set.exerciseId) || [];
        map.set(set.exerciseId, [...existing, set].sort(
          (a, b) => a.setNumber - b.setNumber || (a.dropIndex || 0) - (b.dropIndex || 0)
        ));
      }
    }
    return map;
  }, [session?.sets]);

  // Group ad-hoc sets by exerciseName (for ad-hoc sessions with exerciseId=null)
  const adHocSetsByName = useMemo(() => {
    const map = new Map<string, Set[]>();
    for (const set of session?.sets || []) {
      if (!set.exerciseId) {
        const existing = map.get(set.exerciseName) || [];
        map.set(set.exerciseName, [...existing, set].sort(
          (a, b) => a.setNumber - b.setNumber || (a.dropIndex || 0) - (b.dropIndex || 0)
        ));
      }
    }
    return map;
  }, [session?.sets]);

  // Merge ad-hoc exercises from state with those derived from logged sets
  const allAdHocExercises = useMemo(() => {
    const names = new Set<string>();
    const result: AdHocExercise[] = [];
    // First add exercises from logged sets (preserves order of logging)
    for (const name of adHocSetsByName.keys()) {
      if (!names.has(name)) {
        names.add(name);
        result.push({ tempId: `logged-${name}`, name });
      }
    }
    // Then add exercises from local state that haven't been logged yet
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
    const logged = session?.sets?.filter(s => (s.dropIndex || 0) === 0).length || 0;
    const target = session?.exercises?.reduce(
      (sum: number, ex: Exercise) => sum + ex.targetSets,
      0
    ) || 0;
    return { totalSetsLogged: logged, totalSetsTarget: target };
  }, [session]);

  const handleComplete = () => {
    completeSession(undefined, {
      onSuccess: () => {
        navigate('/');
      },
    });
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

  const exercises = session.exercises || [];

  return (
    <div className="pb-20">
      <SessionHeader
        session={session}
        totalSetsLogged={totalSetsLogged}
        totalSetsTarget={totalSetsTarget}
        onComplete={handleComplete}
        isCompleting={isCompletingSession}
      />

      <RestTimer />

      <div className="space-y-4">
        {/* Programmed exercises (non-ad-hoc sessions) */}
        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            loggedSets={setsByExercise.get(exercise.id) || []}
            previousHint={exerciseHints.get(exercise.id)}
            onLogSet={logSet}
            onDeleteSet={deleteSet}
            isLogging={isLoggingSet}
          />
        ))}

        {/* Ad-hoc exercises (shown for ad-hoc sessions) */}
        {isAdHoc && allAdHocExercises.map((adHocEx) => {
          const sets = adHocSetsByName.get(adHocEx.name) || [];
          const standardSets = sets.filter(s => (s.dropIndex || 0) === 0);
          const nextSetNumber = standardSets.length + 1;
          const lastSet = standardSets.length > 0
            ? standardSets[standardSets.length - 1]
            : undefined;

          return (
            <div key={adHocEx.tempId} className="card">
              <h3 className="font-semibold text-lg mb-3">{adHocEx.name}</h3>

              {/* Logged sets */}
              {sets.length > 0 && (
                <div className="mb-4 space-y-1">
                  {sets.map((set) => (
                    <SwipeableRow
                      key={set.id}
                      onSwipeLeft={() => deleteSet(set.id)}
                      disabled={set.id < 0}
                    >
                      <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                        (set.dropIndex || 0) > 0
                          ? 'bg-orange-50 dark:bg-orange-900/20 ml-4 mt-1'
                          : 'bg-green-50 dark:bg-green-900/20'
                      }`}>
                        <span className={`text-sm font-medium ${
                          (set.dropIndex || 0) > 0
                            ? 'text-orange-700 dark:text-orange-300'
                            : 'text-green-800 dark:text-green-300'
                        }`}>
                          {(set.dropIndex || 0) > 0
                            ? `↳ Drop ${set.dropIndex}`
                            : `Set ${set.setNumber}`}
                        </span>
                        <span className={`font-semibold ${
                          (set.dropIndex || 0) > 0
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
        {isAdHoc && (
          <AddExercise
            onAdd={(exercise) => setAdHocExercises(prev => [...prev, exercise])}
          />
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
      </div>
    </div>
  );
}
