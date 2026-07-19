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
    <div className="card border border-amber-400/60 dark:border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/20">
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex w-2 h-2" aria-hidden>
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full w-2 h-2 bg-amber-500" />
        </span>
        <p className="eyebrow text-amber-600 dark:text-amber-400">In progress</p>
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {timeLabel}
        </span>
      </div>
      <div className="mb-4">
        <p className="text-xl font-display font-bold">{activeSession.workoutName}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {activeSession.programName} &middot; {setsLogged} set{setsLogged !== 1 ? 's' : ''} logged
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={() => navigate(`/workout/${activeSession.id}`)}
        >
          Resume Workout
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="shrink-0 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={handleDiscard}
          disabled={discardMutation.isPending}
        >
          Discard
        </Button>
      </div>
    </div>
  );
}
