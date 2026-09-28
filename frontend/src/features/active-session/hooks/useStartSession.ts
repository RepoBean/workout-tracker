import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../shared/api/client';
import type { StartSessionRequest, ActiveSession } from '../../../shared/api/types';
import { useToast } from '../../../shared/ui/Toast';
import { queryKeys } from '../../../shared/api/queries';

export function useStartSession() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: StartSessionRequest) => {
      const { data } = await api.post<ActiveSession>('/sessions/start', request);
      return data;
    },
    onSuccess: (session) => {
      // Dashboard resume card + the Android foreground service key off this.
      queryClient.invalidateQueries({ queryKey: queryKeys.activeSession });
      navigate(`/workout/${session.id}`);
    },
    onError: () => {
      toast.error('Failed to start workout. Please try again.');
    },
  });
}
