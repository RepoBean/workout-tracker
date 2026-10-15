import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../shared/api/client';
import { useToast } from '../../../shared/ui/Toast';
import { useStartSession } from '../../active-session/hooks/useStartSession';
import type { ActiveSession, CardioModality } from '../../../shared/api/types';
import type { WorkoutChoice } from '../components/AdHocWorkoutPicker';

/** Quick Workout: start the picked workout now, as an ad-hoc session. */
export function useQuickWorkout() {
  const startSession = useStartSession();
  const navigate = useNavigate();
  const toast = useToast();

  const startCardioSession = useMutation({
    mutationFn: async (modality: CardioModality) => {
      const { data } = await api.post<ActiveSession>('/sessions/start', { isAdHoc: true });
      return { session: data, modality };
    },
    onSuccess: ({ session, modality }) => {
      navigate(`/workout/${session.id}?cardio=${modality}`);
    },
    onError: () => {
      toast.error('Failed to start cardio. Please try again.');
    },
  });

  const start = (choice: WorkoutChoice) => {
    if (choice.kind === 'cardio') startCardioSession.mutate(choice.modality);
    else if (choice.kind === 'workout') startSession.mutate({ workoutId: choice.workoutId, isAdHoc: true });
    else startSession.mutate({ isAdHoc: true });
  };

  return { start, isPending: startSession.isPending || startCardioSession.isPending };
}
