import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../shared/api/client';
import { usePrograms, useHistory, useStats } from '../../../shared/api/queries';
import { useUserProfile } from '../../../shared/context/UserProfileContext';
import { useProgression } from '../../../shared/context/ProgressionContext';
import type { Session } from '../../../shared/api/types';
import {
  assembleDossier,
  buildAllTimeParts,
  buildAthleteLine,
  buildProgramBlock,
  buildStatsBlock,
  renderSessions,
} from '../lib/dossier';

/** Sessions rendered in full detail in the dossier. Beyond this, the model uses the tool. */
export const RECENT_SESSION_COUNT = 20;
/** A personal lifetime; the backend clamps to [1, 2000]. */
export const ALL_TIME_LIMIT = 1000;

const ALLTIME_STORAGE_KEY = 'wt:coach-dossier-alltime';
/** The all-time payload is ~618 KB — well past the axios client's global 10 s timeout. */
const ALL_TIME_TIMEOUT_MS = 60000;

interface CachedAllTime {
  key: string;
  allTime: string;
  notes: string;
}

/** Local calendar date as YYYY-MM-DD. Never UTC — "today" means the user's today. */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function readCache(): CachedAllTime | null {
  try {
    const raw = localStorage.getItem(ALLTIME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedAllTime>;
    if (typeof parsed.key !== 'string' || typeof parsed.allTime !== 'string') return null;
    return { key: parsed.key, allTime: parsed.allTime, notes: parsed.notes ?? '' };
  } catch {
    return null;
  }
}

function writeCache(value: CachedAllTime): void {
  try {
    localStorage.setItem(ALLTIME_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode / quota — recompute next time rather than break the page.
  }
}

/**
 * Assembles the coach's preloaded dossier.
 *
 * Two fetches with very different costs:
 *  - The recent-20 block is small and always fresh.
 *  - The all-time block needs every session (~618 KB). That fetch is made ONCE and the
 *    *computed text* — not the payload — is memoized to localStorage. The key is the newest
 *    session id + total session count + today, so it recomputes when a workout completes
 *    (every 2-3 days) or the date rolls over (the "dropped 2.5mo" flags are relative to today).
 *
 * Programs and stats ride the existing queries; profile and progression settings are
 * localStorage-backed contexts and cost no fetch at all.
 */
export function useCoachDossier() {
  // Pinned for the life of the hook so the text cannot shift under a cached prompt prefix
  // if the page is left open across midnight.
  const [today] = useState(localToday);

  const { profile } = useUserProfile();
  const { settings: progression } = useProgression();
  const { data: programs } = usePrograms();
  const { data: stats } = useStats();
  const { data: recentSessions } = useHistory(RECENT_SESSION_COUNT, 0);

  // Identity of the current history: newest session + how many there are.
  const newestId = recentSessions?.[0]?.id ?? 0;
  const totalSessions = stats?.totalSessions ?? 0;
  const cacheKey = newestId && totalSessions ? `${newestId}:${totalSessions}:${today}` : '';

  const cached = useMemo(() => {
    if (!cacheKey) return null;
    const hit = readCache();
    return hit && hit.key === cacheKey ? hit : null;
  }, [cacheKey]);

  const { data: allTimeParts } = useQuery({
    queryKey: ['coachDossierAllTime', cacheKey],
    // Only pay for the big fetch when the memoized text is missing or stale.
    enabled: Boolean(cacheKey) && !cached,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const { data } = await api.get<Session[]>('/sessions/history', {
        params: { limit: ALL_TIME_LIMIT },
        timeout: ALL_TIME_TIMEOUT_MS,
      });
      const parts = buildAllTimeParts(data, today);
      writeCache({ key: cacheKey, ...parts });
      return parts;
    },
  });

  const resolved = cached ?? allTimeParts ?? null;

  const dossier = useMemo(() => {
    if (!resolved || !recentSessions) return null;
    return assembleDossier({
      today,
      athlete: buildAthleteLine(profile, progression, today),
      programs: buildProgramBlock(programs ?? []),
      allTime: resolved.allTime,
      notes: resolved.notes,
      recent: renderSessions(recentSessions),
      recentCount: recentSessions.length,
      stats: buildStatsBlock(stats ?? null),
    });
  }, [resolved, recentSessions, today, profile, progression, programs, stats]);

  return { dossier, isReady: dossier !== null };
}
