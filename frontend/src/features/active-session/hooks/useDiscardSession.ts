import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../shared/api/client';
import { queryKeys } from '../../../shared/api/queries';
import { useToast } from '../../../shared/ui/Toast';
import { clearSessionLocalState } from '../lib/sessionStorage';

// Deletes an incomplete session (and its sets, via cascade) and sweeps the
// session-scoped localStorage. Shared by the active-session screen and the
// dashboard Resume card.
export function useDiscardSession() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (sessionId: number) => {
      await api.delete(`/sessions/${sessionId}`);
    },
    onSuccess: (_data, sessionId) => {
      clearSessionLocalState(sessionId);
      toast.success('Workout discarded');
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSession });
    },
    onError: () => {
      toast.error('Failed to discard workout');
    },
  });
}
