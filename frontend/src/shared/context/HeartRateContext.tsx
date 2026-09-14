import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { HrTransport, getHrTransport, isHrSupported } from '../lib/hrTransport';

interface HeartRateStats {
  avg: number;
  min: number;
  max: number;
}

interface HeartRateContextType {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  deviceName: string | null;
  currentBpm: number | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  restoreSamples: (samples: { ts: number; bpm: number }[]) => void;
  statsSince: (ts: number) => HeartRateStats | null;
  samplesSince: (ts: number) => { ts: number; bpm: number }[];
}

const HeartRateContext = createContext<HeartRateContextType | undefined>(undefined);

export function HeartRateProvider({ children }: { children: ReactNode }) {
  const isSupported = isHrSupported();

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [currentBpm, setCurrentBpm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const transportRef = useRef<HrTransport | null>(null);
  const samplesRef = useRef<{ ts: number; bpm: number }[]>([]);

  // Drop samples older than the longest plausible session window so the
  // buffer can't grow unbounded across long-lived provider mounts.
  const SAMPLE_RETENTION_MS = 3 * 60 * 60 * 1000;

  const pushSample = useCallback((bpm: number) => {
    const now = Date.now();
    samplesRef.current.push({ ts: now, bpm });
    const cutoff = now - SAMPLE_RETENTION_MS;
    while (samplesRef.current.length > 0 && samplesRef.current[0].ts < cutoff) {
      samplesRef.current.shift();
    }
    setCurrentBpm(bpm);
  }, []);

  const handleDisconnected = useCallback(() => {
    setIsConnected(false);
    setCurrentBpm(null);
    setDeviceName(null);
  }, []);

  const connect = useCallback(async () => {
    if (!isSupported) {
      setError('Bluetooth is not supported on this device.');
      return;
    }
    setError(null);
    setIsConnecting(true);
    try {
      const transport = await getHrTransport();
      transportRef.current = transport;
      const info = await transport.connect({
        onBpm: pushSample,
        onDisconnected: handleDisconnected,
      });
      setDeviceName(info.name);
      setIsConnected(true);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      if (!/cancelled/i.test(message)) {
        setError(message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [isSupported, pushSample, handleDisconnected]);

  const disconnect = useCallback(() => {
    if (transportRef.current) {
      transportRef.current.disconnect().catch(() => {});
    }
    setIsConnected(false);
    setCurrentBpm(null);
    setDeviceName(null);
  }, []);

  // Merge previously persisted samples back into the buffer (page-reload /
  // tab-discard recovery). Skips timestamps already present, keeps the buffer
  // sorted, and applies the same validity + retention rules as live samples.
  const restoreSamples = useCallback((samples: { ts: number; bpm: number }[]) => {
    const cutoff = Date.now() - SAMPLE_RETENTION_MS;
    const seen = new Set(samplesRef.current.map((s) => s.ts));
    const incoming = samples.filter((s) => {
      if (!Number.isFinite(s?.ts) || !Number.isFinite(s?.bpm)) return false;
      if (s.bpm <= 0 || s.bpm > 250) return false;
      if (s.ts < cutoff || seen.has(s.ts)) return false;
      seen.add(s.ts);
      return true;
    });
    if (incoming.length === 0) return;
    samplesRef.current = [...samplesRef.current, ...incoming].sort((a, b) => a.ts - b.ts);
  }, []);

  const statsSince = useCallback((ts: number): HeartRateStats | null => {
    const window = samplesRef.current.filter((s) => s.ts >= ts);
    if (window.length === 0) return null;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const s of window) {
      sum += s.bpm;
      if (s.bpm < min) min = s.bpm;
      if (s.bpm > max) max = s.bpm;
    }
    return {
      avg: Math.round(sum / window.length),
      min,
      max,
    };
  }, []);

  const samplesSince = useCallback(
    (ts: number) => samplesRef.current.filter((s) => s.ts >= ts),
    [],
  );

  // Auto-reconnect on mount if the platform remembers a previously connected strap
  useEffect(() => {
    if (!isSupported) return;
    let cancelled = false;

    const tryReconnect = async () => {
      try {
        const transport = await getHrTransport();
        if (cancelled) return;
        transportRef.current = transport;
        const info = await transport.reconnect({
          onBpm: pushSample,
          onDisconnected: handleDisconnected,
        });
        if (cancelled || !info) return;
        setDeviceName(info.name);
        setIsConnected(true);
      } catch {
        // Silent
      }
    };

    tryReconnect();
    return () => {
      cancelled = true;
    };
  }, [isSupported, pushSample, handleDisconnected]);

  const value = useMemo<HeartRateContextType>(() => ({
    isSupported,
    isConnected,
    isConnecting,
    deviceName,
    currentBpm,
    error,
    connect,
    disconnect,
    restoreSamples,
    statsSince,
    samplesSince,
  }), [
    isSupported,
    isConnected,
    isConnecting,
    deviceName,
    currentBpm,
    error,
    connect,
    disconnect,
    restoreSamples,
    statsSince,
    samplesSince,
  ]);

  return (
    <HeartRateContext.Provider value={value}>
      {children}
    </HeartRateContext.Provider>
  );
}

export function useHeartRate() {
  const context = useContext(HeartRateContext);
  if (!context) {
    throw new Error('useHeartRate must be used within a HeartRateProvider');
  }
  return context;
}
