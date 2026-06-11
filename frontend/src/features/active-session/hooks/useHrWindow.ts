import { useEffect, useRef } from 'react';

/**
 * HR tracking window refs — session-level stats use sessionStartRef; per-set
 * stats use lastSetAtRef (the caller advances it after each logged set).
 * Both are anchored to session.createdAt once it loads so that resumed
 * sessions use the real start time, not hook mount time. Anchoring runs only
 * once — after that, lastSetAtRef advances per-set and must not be clobbered
 * by re-renders.
 */
export function useHrWindow(sessionCreatedAt: string | undefined) {
  const sessionStartRef = useRef<number>(Date.now());
  const lastSetAtRef = useRef<number>(sessionStartRef.current);
  const anchoredRef = useRef(false);

  useEffect(() => {
    if (anchoredRef.current) return;
    if (!sessionCreatedAt) return;
    const startMs = new Date(sessionCreatedAt).getTime();
    sessionStartRef.current = startMs;
    lastSetAtRef.current = startMs;
    anchoredRef.current = true;
  }, [sessionCreatedAt]);

  return { sessionStartRef, lastSetAtRef };
}
