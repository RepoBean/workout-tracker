import { useEffect, useRef } from 'react';
import { useHeartRate } from '../../../shared/context/HeartRateContext';
import { encodeHrSamples, decodeHrSamples } from '../../../shared/utils/heartRate';
import { getHrSamplesStorageKey } from '../lib/sessionStorage';

const FLUSH_INTERVAL_MS = 25_000;

/**
 * Persists the session's HR samples to localStorage so a page reload or
 * mobile tab discard mid-workout doesn't lose the accumulated series — both
 * the live chart and the completion summary read from the in-memory buffer.
 *
 * Restore runs once per session id and MUST happen before the first flush:
 * a flush from a freshly reloaded page would otherwise overwrite storage
 * with only post-reload samples.
 *
 * There is deliberately no flush in the effect cleanup — discard/completion
 * paths sweep the storage key via clearSessionLocalState, and a cleanup
 * flush racing that sweep would resurrect the key forever. SPA navigation
 * doesn't need it (the buffer lives in the app-root provider), and
 * reload/discard are covered by the pagehide/visibilitychange flushes.
 */
export function useHrPersistence(params: {
  sessionId: number;
  sessionStartMs: number | null; // null until the session loads
  isSessionActive: boolean;      // false once completed (or celebration shown)
}): void {
  const { sessionId, sessionStartMs, isSessionActive } = params;
  const { isConnected, restoreSamples, samplesSince } = useHeartRate();
  const restoredForRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(sessionId) || sessionStartMs === null || !isSessionActive) return;
    const key = getHrSamplesStorageKey(sessionId);

    if (restoredForRef.current !== sessionId) {
      restoredForRef.current = sessionId;
      const stored = decodeHrSamples(localStorage.getItem(key));
      if (stored && stored.length > 0) restoreSamples(stored);
    }

    const flush = () => {
      const samples = samplesSince(sessionStartMs);
      if (samples.length === 0) return;
      try {
        localStorage.setItem(key, encodeHrSamples(samples, sessionStartMs));
      } catch {
        // quota — skip; the next flush retries
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    const intervalId = isConnected
      ? window.setInterval(flush, FLUSH_INTERVAL_MS)
      : undefined;
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flush);

    return () => {
      if (intervalId !== undefined) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flush);
    };
  }, [sessionId, sessionStartMs, isSessionActive, isConnected, restoreSamples, samplesSince]);
}
