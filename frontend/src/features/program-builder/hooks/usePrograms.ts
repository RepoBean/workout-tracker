import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../shared/api/client';
import { queryKeys } from '../../../shared/api/queries';
import { useToast } from '../../../shared/ui/Toast';
import type {
  Program,
  Workout,
  Exercise,
  CreateProgramRequest,
  UpdateProgramRequest,
  CreateWorkoutRequest,
  UpdateWorkoutRequest,
  CreateExerciseRequest,
  UpdateExerciseRequest,
  ProgramExportPayload,
} from '../../../shared/api/types';

export function useProgramMutations() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const invalidatePrograms = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.programs });
    // Note: useNextWorkoutLocal uses programs query, so no separate invalidation needed
  };

  const createProgram = useMutation({
    mutationFn: async (data: CreateProgramRequest) => {
      const { data: program } = await api.post<Program>('/programs', data);
      return program;
    },
    onSuccess: () => {
      invalidatePrograms();
      toast.success('Program created');
    },
    onError: () => {
      toast.error('Failed to create program');
    },
  });

  const updateProgram = useMutation({
    mutationFn: async ({ id, ...data }: UpdateProgramRequest & { id: number }) => {
      const { data: program } = await api.put<Program>(`/programs/${id}`, data);
      return program;
    },
    onSuccess: () => {
      invalidatePrograms();
    },
    onError: () => {
      toast.error('Failed to update program');
    },
  });

  const deleteProgram = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/programs/${id}`);
    },
    onSuccess: () => {
      invalidatePrograms();
      toast.success('Program archived');
    },
    onError: () => {
      toast.error('Failed to archive program');
    },
  });

  const activateProgram = useMutation({
    mutationFn: async (id: number) => {
      const { data: program } = await api.put<Program>(`/programs/${id}/set-active`);
      return program;
    },
    onSuccess: () => {
      invalidatePrograms();
      toast.success('Program activated');
    },
    onError: () => {
      toast.error('Failed to activate program');
    },
  });

  const importProgram = useMutation({
    mutationFn: async (data: ProgramExportPayload) => {
      const { data: program } = await api.post<Program>('/programs/import', data);
      return program;
    },
    onSuccess: () => {
      invalidatePrograms();
      toast.success('Program imported');
    },
    onError: () => {
      toast.error('Failed to import program');
    },
  });

  const createWorkout = useMutation({
    mutationFn: async (data: CreateWorkoutRequest) => {
      const { data: workout } = await api.post<Workout>('/workouts', data);
      return workout;
    },
    onSuccess: () => {
      invalidatePrograms();
    },
    onError: () => {
      toast.error('Failed to create workout');
    },
  });

  const updateWorkout = useMutation({
    mutationFn: async ({ id, ...data }: UpdateWorkoutRequest & { id: number }) => {
      const { data: workout } = await api.put<Workout>(`/workouts/${id}`, data);
      return workout;
    },
    onSuccess: () => {
      invalidatePrograms();
    },
    onError: () => {
      toast.error('Failed to update workout');
    },
  });

  const deleteWorkout = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/workouts/${id}`);
    },
    onSuccess: () => {
      invalidatePrograms();
      toast.success('Workout deleted');
    },
    onError: () => {
      toast.error('Failed to delete workout');
    },
  });

  const reorderWorkouts = useMutation({
    mutationFn: async (workoutIds: number[]) => {
      await api.post('/workouts/reorder', { workoutIds });
    },
    onSuccess: () => {
      invalidatePrograms();
    },
    onError: () => {
      toast.error('Failed to reorder workouts');
    },
  });

  const reorderExercises = useMutation({
    mutationFn: async ({ workoutId, exerciseIds }: { workoutId: number; exerciseIds: number[] }) => {
      await api.post(`/workouts/${workoutId}/reorder-exercises`, { exerciseIds });
    },
    onSuccess: () => {
      invalidatePrograms();
    },
    onError: () => {
      toast.error('Failed to reorder exercises');
    },
  });

  const createExercise = useMutation({
    mutationFn: async (data: CreateExerciseRequest) => {
      const { data: exercise } = await api.post<Exercise>('/exercises', data);
      return exercise;
    },
    onSuccess: () => {
      invalidatePrograms();
    },
    onError: () => {
      toast.error('Failed to create exercise');
    },
  });

  const updateExercise = useMutation({
    mutationFn: async ({ id, ...data }: UpdateExerciseRequest & { id: number }) => {
      const { data: exercise } = await api.put<Exercise>(`/exercises/${id}`, data);
      return exercise;
    },
    onSuccess: () => {
      invalidatePrograms();
    },
    onError: () => {
      toast.error('Failed to update exercise');
    },
  });

  const deleteExercise = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/exercises/${id}`);
    },
    onSuccess: () => {
      invalidatePrograms();
    },
    onError: () => {
      toast.error('Failed to delete exercise');
    },
  });

  return {
    createProgram,
    updateProgram,
    deleteProgram,
    activateProgram,
    importProgram,
    createWorkout,
    updateWorkout,
    deleteWorkout,
    reorderWorkouts,
    reorderExercises,
    createExercise,
    updateExercise,
    deleteExercise,
  };
}
