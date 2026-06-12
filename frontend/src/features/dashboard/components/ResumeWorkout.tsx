import { useNavigate } from 'react-router-dom';
import { useActiveSessionCheck } from '../../../shared/api/queries';
import { Button } from '../../../shared/ui/Button';
import { useDiscardSession } from '../../active-session/hooks/useDiscardSession';

export function ResumeWorkout() {
  const navigate = useNavigate();
  const { data: activeSession, isLoading } = useActiveSessionCheck();

  const discardMutation = useDiscardSession();

  if (isLoading || !activeSession) return null;

  const setsLogged = activeSession.sets?.length || 0;
  const startedAt = new Date(activeSession.createdAt);
  const minutesAgo = Math.floor((Date.now() - startedAt.getTime()) / 60000);
  const timeLabel = minutesAgo < 60
    ? `${minutesAgo}m ago`
    : `${Math.floor(minutesAgo / 60)}h ${minutesAgo % 60}m ago`;

  const handleDiscard = () => {
    const detail = setsLogged > 0
      ? ` This will delete ${setsLogged} logged set${setsLogged !== 1 ? 's' : ''}.`
      : '';
    if (!confirm(`Discard this workout?${detail}`)) return;
    discardMutation.mutate(activeSession.id);
  };

  return (
    <div className="card border-2 border-amber-500 dark:border-amber-400">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
        <h2 className="text-sm font-medium text-amber-600 dark:text-amber-400">
          Workout In Progress
        </h2>
      </div>
      <div className="mb-3">
        <p className="text-xl font-display font-bold">{activeSession.workoutName}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {activeSession.programName} &middot; Started {timeLabel}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {setsLogged} set{setsLogged !== 1 ? 's' : ''} logged
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={() => navigate(`/workout/${activeSession.id}`)}
        >
          Resume Workout
        </Button>
        <Button
          variant="danger"
          size="lg"
          onClick={handleDiscard}
          disabled={discardMutation.isPending}
        >
          Discard
        </Button>
      </div>
    </div>
  );
}
