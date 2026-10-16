import { useMemo } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queries';
import type { BodyWeight } from './types';
import { useToast } from '../ui/Toast';
import { useUserProfile } from '../context/UserProfileContext';
import { bodyweightLookup, weighInFingerprint, type BodyweightAt } from '../lib/bodyweight';

// Weigh-ins (v4 C3, docs/v4-bundle-c3-bodyweight.md). Every derived number (volume,
// 1RM, PRs, Progress, the coach) is computed from this one query, so mutations only
// invalidate it.

export interface BodyweightLog {
  /** false = the backend predates C3 (404): everything uses the profile value, as before. */
  available: boolean;
  weighIns: BodyWeight[];
}

export function useBodyweights() {
  return useQuery({
    queryKey: queryKeys.bodyweights,
    queryFn: async (): Promise<BodyweightLog> => {
      try {
        const { data } = await api.get<BodyWeight[]>('/bodyweights');
        return { available: true, weighIns: data };
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          return { available: false, weighIns: [] };
        }
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000, // Changes only when this device or the other logs a weigh-in
  });
}

const NO_WEIGH_INS: BodyWeight[] = [];

/**
 * The bodyweight to score an assisted set with, by its session's `completedAt` (null =
 * the session in progress). Until the weigh-ins load (or if the fetch fails) it falls back
 * to the device's profile value, which is what every figure used before C3.
 * `fingerprint` changes with any weigh-in edit or the fallback — for memo keys.
 */
export function useBodyweightAt(): {
  bodyweightAt: BodyweightAt;
  ready: boolean;
  fingerprint: string;
} {
  const query = useBodyweights();
  const { profile: { bodyweight: fallback } } = useUserProfile();
  const weighIns = query.data?.weighIns ?? NO_WEIGH_INS;
  return useMemo(() => ({
    bodyweightAt: bodyweightLookup(weighIns, fallback),
    ready: query.isSuccess || query.isError,
    fingerprint: `${weighInFingerprint(weighIns)}:${fallback ?? ''}`,
  }), [weighIns, fallback, query.isSuccess, query.isError]);
}

/** Log a weigh-in; the same date again overwrites it (server upsert). */
export function useLogWeighIn(options: { toast?: boolean } = {}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const announce = options.toast ?? true;

  return useMutation({
    mutationFn: async (input: { date: string; weight: number }) => {
      const { data } = await api.post<BodyWeight>('/bodyweights', input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bodyweights });
      if (announce) toast.success('Weigh-in saved');
    },
    onError: () => {
      toast.error('Failed to save weigh-in');
    },
  });
}

export function useUpdateWeighIn() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({ id, ...input }: { id: number; date?: string; weight?: number }) => {
      const { data } = await api.put<BodyWeight>(`/bodyweights/${id}`, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bodyweights });
      toast.success('Weigh-in updated');
    },
    onError: (err) => {
      toast.error(axios.isAxiosError(err) && err.response?.status === 409
        ? 'There is already a weigh-in on that date'
        : 'Failed to update weigh-in');
    },
  });
}

export function useDeleteWeighIn() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/bodyweights/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bodyweights });
      toast.success('Weigh-in deleted');
    },
    onError: () => {
      toast.error('Failed to delete weigh-in');
    },
  });
}
