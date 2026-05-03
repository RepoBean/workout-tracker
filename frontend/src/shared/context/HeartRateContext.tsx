import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';

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
  clearSamples: () => void;
  statsSince: (ts: number) => HeartRateStats | null;
  samplesSince: (ts: number) => { ts: number; bpm: number }[];
}

const HeartRateContext = createContext<HeartRateContextType | undefined>(undefined);

const HEART_RATE_SERVICE = 'heart_rate';
const HEART_RATE_MEASUREMENT = 'heart_rate_measurement';

function parseHr(value: DataView): number {
  const flags = value.getUint8(0);
  const is16Bit = (flags & 0x01) !== 0;
  return is16Bit ? value.getUint16(1, true) : value.getUint8(1);
}

export function HeartRateProvider({ children }: { children: ReactNode }) {
  const isSupported =
    typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [currentBpm, setCurrentBpm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const samplesRef = useRef<{ ts: number; bpm: number }[]>([]);
  const isSubscribedRef = useRef(false);

  // Drop samples older than the longest plausible session window so the
  // buffer can't grow unbounded across long-lived provider mounts.
  const SAMPLE_RETENTION_MS = 3 * 60 * 60 * 1000;

  const handleValueChanged = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value) return;
    const bpm = parseHr(target.value);
    if (bpm <= 0 || bpm > 250) return;
    const now = Date.now();
    samplesRef.current.push({ ts: now, bpm });
    const cutoff = now - SAMPLE_RETENTION_MS;
    while (samplesRef.current.length > 0 && samplesRef.current[0].ts < cutoff) {
      samplesRef.current.shift();
    }
    setCurrentBpm(bpm);
  }, []);

  const cleanupListeners = useCallback(() => {
    const char = characteristicRef.current;
    characteristicRef.current = null;
    isSubscribedRef.current = false;
    if (!char) return;
    try {
      char.removeEventListener('characteristicvaluechanged', handleValueChanged);
    } catch {
      // Listener may already be detached
    }
    try {
      char.stopNotifications().catch(() => {});
    } catch {
      // Characteristic may already be torn down
    }
  }, [handleValueChanged]);

  const handleDisconnected = useCallback(() => {
    cleanupListeners();
    setIsConnected(false);
    setCurrentBpm(null);
  }, [cleanupListeners]);

  const subscribeToDevice = useCallback(
    async (device: BluetoothDevice) => {
      if (!device.gatt) throw new Error('Device has no GATT server');
      if (isSubscribedRef.current) return;
      isSubscribedRef.current = true;
      try {
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(HEART_RATE_SERVICE);
        const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleValueChanged);

        device.removeEventListener('gattserverdisconnected', handleDisconnected);
        device.addEventListener('gattserverdisconnected', handleDisconnected);

        deviceRef.current = device;
        characteristicRef.current = characteristic;
        setDeviceName(device.name ?? 'Heart Rate Monitor');
        setIsConnected(true);
        setError(null);
      } catch (err) {
        isSubscribedRef.current = false;
        throw err;
      }
    },
    [handleValueChanged, handleDisconnected],
  );

  const connect = useCallback(async () => {
    if (!isSupported) {
      setError('Bluetooth is not supported in this browser.');
      return;
    }
    setError(null);
    setIsConnecting(true);
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
        optionalServices: ['battery_service'],
      });
      await subscribeToDevice(device);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      if (!/cancelled/i.test(message)) {
        setError(message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [isSupported, subscribeToDevice]);

  const disconnect = useCallback(() => {
    cleanupListeners();
    const device = deviceRef.current;
    if (device) {
      device.removeEventListener('gattserverdisconnected', handleDisconnected);
      if (device.gatt?.connected) {
        try {
          device.gatt.disconnect();
        } catch {
          // Ignore
        }
      }
    }
    deviceRef.current = null;
    setIsConnected(false);
    setCurrentBpm(null);
    setDeviceName(null);
  }, [cleanupListeners, handleDisconnected]);

  const clearSamples = useCallback(() => {
    samplesRef.current = [];
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

  // Auto-reconnect on mount if the browser remembers a paired device
  useEffect(() => {
    if (!isSupported) return;
    let cancelled = false;
    const tryReconnect = async () => {
      const bt = navigator.bluetooth as Bluetooth & {
        getDevices?: () => Promise<BluetoothDevice[]>;
      };
      if (typeof bt.getDevices !== 'function') return;
      try {
        const devices = await bt.getDevices();
        if (cancelled || devices.length === 0) return;
        for (const device of devices) {
          if (cancelled) return;
          if (device.gatt?.connected) continue;
          try {
            await subscribeToDevice(device);
            return;
          } catch {
            // Try next device
          }
        }
      } catch {
        // getDevices not permitted — silent
      }
    };
    tryReconnect();
    return () => {
      cancelled = true;
    };
  }, [isSupported, subscribeToDevice]);

  return (
    <HeartRateContext.Provider
      value={{
        isSupported,
        isConnected,
        isConnecting,
        deviceName,
        currentBpm,
        error,
        connect,
        disconnect,
        clearSamples,
        statsSince,
        samplesSince,
      }}
    >
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
