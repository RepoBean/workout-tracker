import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../shared/api/client';
import type { StartSessionRequest, ActiveSession } from '../../../shared/api/types';
import { useToast } from '../../../shared/ui/Toast';

export function useStartSession() {
  const navigate = useNavigate();
  const toast = useToast();

  return useMutation({
    mutationFn: async (request: StartSessionRequest) => {
      const { data } = await api.post<ActiveSession>('/sessions/start', request);
      return data;
    },
    onSuccess: (session) => {
      navigate(`/workout/${session.id}`);
    },
    onError: () => {
      toast.error('Failed to start workout. Please try again.');
    },
  });
}
