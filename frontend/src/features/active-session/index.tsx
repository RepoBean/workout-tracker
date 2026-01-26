import { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useActiveSession } from './hooks/useActiveSession';
import { usePreviousData } from './hooks/usePreviousData';
import { SessionHeader } from './components/SessionHeader';
import { ExerciseCard } from './components/ExerciseCard';
import type { Set, Exercise } from '../../shared/api/types';

export default function ActiveSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sessionId = Number(id);

  const {
    session,
    isLoading,
    error,
    logSet,
    isLoggingSet,
    completeSession,
    isCompletingSession,
  } = useActiveSession(sessionId);

  const { exerciseHints } = usePreviousData(sessionId);

  // Group sets by exercise
  const setsByExercise = useMemo(() => {
    const map = new Map<number, Set[]>();
    for (const set of session?.sets || []) {
      if (set.exerciseId) {
        const existing = map.get(set.exerciseId) || [];
        map.set(set.exerciseId, [...existing, set].sort((a, b) => a.setNumber - b.setNumber));
      }
    }
    return map;
  }, [session?.sets]);

  // Calculate totals
  const { totalSetsLogged, totalSetsTarget } = useMemo(() => {
    const logged = session?.sets?.length || 0;
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

      <div className="space-y-4">
        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            loggedSets={setsByExercise.get(exercise.id) || []}
            previousHint={exerciseHints.get(exercise.id)}
            onLogSet={logSet}
            isLogging={isLoggingSet}
          />
        ))}

        {exercises.length === 0 && (
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
