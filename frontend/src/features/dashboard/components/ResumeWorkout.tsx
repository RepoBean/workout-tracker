import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveSessionCheck, queryKeys } from '../../../shared/api/queries';
import { api } from '../../../shared/api/client';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { useToast } from '../../../shared/ui/Toast';
import { clearSessionLocalState } from '../../active-session/lib/sessionStorage';

export function ResumeWorkout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: activeSession, isLoading } = useActiveSessionCheck();
  const [showDiscard, setShowDiscard] = useState(false);

  const discardMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      await api.delete(`/sessions/${sessionId}`);
    },
    onSuccess: (_data, sessionId) => {
      clearSessionLocalState(sessionId);
      toast.success('Workout discarded');
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSession });
      setShowDiscard(false);
    },
    onError: () => {
      toast.error('Failed to discard workout');
    },
  });

  if (isLoading || !activeSession) return null;

  const setsLogged = activeSession.sets?.length || 0;
  const startedAt = new Date(activeSession.createdAt);
  const minutesAgo = Math.floor((Date.now() - startedAt.getTime()) / 60000);
  const timeLabel = minutesAgo < 60
    ? `${minutesAgo}m ago`
    : `${Math.floor(minutesAgo / 60)}h ${minutesAgo % 60}m ago`;

  return (
    <>
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
            onClick={() => setShowDiscard(true)}
          >
            Discard
          </Button>
        </div>
      </div>

      <Modal
        isOpen={showDiscard}
        onClose={() => setShowDiscard(false)}
        title="Discard Workout?"
      >
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          This will permanently delete this incomplete session and all {setsLogged} logged set{setsLogged !== 1 ? 's' : ''}.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setShowDiscard(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => discardMutation.mutate(activeSession.id)}
            disabled={discardMutation.isPending}
          >
            {discardMutation.isPending ? 'Discarding...' : 'Discard'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
