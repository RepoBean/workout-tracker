import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';

interface TimerContextType {
  isRunning: boolean;
  timeRemaining: number;
  targetDuration: number;
  progress: number;
  startTimer: (seconds: number) => void;
  stopTimer: () => void;
  extendTimer: (seconds: number) => void;
  skipTimer: () => void;
  notificationPermission: NotificationPermission | 'unsupported';
  requestNotificationPermission: () => Promise<void>;
}

interface TimerState {
  isRunning: boolean;
  timeRemaining: number;
  targetDuration: number;
  endTime: number | null;
}

const STORAGE_KEY = 'workout-tracker-timer';

const initialState: TimerState = {
  isRunning: false,
  timeRemaining: 0,
  targetDuration: 0,
  endTime: null,
};

function loadPersistedTimer(): TimerState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return initialState;

    const { endTime, targetDuration } = JSON.parse(stored);
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));

    if (remaining > 0) {
      return {
        isRunning: true,
        timeRemaining: remaining,
        targetDuration,
        endTime,
      };
    }
  } catch {
    // Corrupted data, ignore
  }
  localStorage.removeItem(STORAGE_KEY);
  return initialState;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

export function TimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TimerState>(loadPersistedTimer);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Notification permission
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }, []);

  // Completion handler — sound, vibration, notification
  const triggerCompletion = useCallback(() => {
    // Vibration
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }

    // Audio beep via Web Audio API
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gain.gain.value = 0.3;

      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        ctx.close();
        audioContextRef.current = null;
      }, 200);
    } catch {
      // Audio not available, ignore
    }

    // System notification — Chrome on Android throws "Illegal constructor"
    // for page-scoped Notifications (needs a service worker, which we removed)
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Rest Complete', {
          body: 'Time for your next set!',
          tag: 'rest-timer',
        });
      }
    } catch {
      // Notification unavailable; vibration/beep already fired
    }
  }, []);

  // Drift-corrected tick — runs when timer is active
  useEffect(() => {
    if (!state.isRunning || !state.endTime) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((state.endTime! - Date.now()) / 1000));

      if (remaining <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        // Reset state before firing completion effects so a throwing
        // sound/notification can't strand the UI on a stale countdown
        setState(initialState);
        localStorage.removeItem(STORAGE_KEY);
        triggerCompletion();
      } else {
        // Interval runs at 100ms for drift correction, but timeRemaining only
        // changes once a second — bail with the same object so consumers
        // (the whole ActiveSession tree) don't re-render at 10 Hz.
        setState(prev => remaining === prev.timeRemaining ? prev : { ...prev, timeRemaining: remaining });
      }
    };

    // Immediate tick to sync, then every 100ms
    tick();
    intervalRef.current = setInterval(tick, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.isRunning, state.endTime, triggerCompletion]);

  // Actions
  const startTimer = useCallback((seconds: number) => {
    const endTime = Date.now() + seconds * 1000;

    setState({
      isRunning: true,
      timeRemaining: seconds,
      targetDuration: seconds,
      endTime,
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ endTime, targetDuration: seconds }));

    // Request notification permission on first use
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(setNotificationPermission);
    }
  }, []);

  const stopTimer = useCallback(() => {
    setState(initialState);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const extendTimer = useCallback((seconds: number) => {
    setState(prev => {
      if (!prev.isRunning || !prev.endTime) return prev;

      const newEndTime = prev.endTime + seconds * 1000;
      const newRemaining = Math.max(0, Math.ceil((newEndTime - Date.now()) / 1000));
      const newTarget = prev.targetDuration + seconds;

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ endTime: newEndTime, targetDuration: newTarget }));

      return {
        ...prev,
        endTime: newEndTime,
        timeRemaining: newRemaining,
        targetDuration: newTarget,
      };
    });
  }, []);

  const skipTimer = useCallback(() => {
    setState(initialState);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo<TimerContextType>(() => ({
    isRunning: state.isRunning,
    timeRemaining: state.timeRemaining,
    targetDuration: state.targetDuration,
    progress: state.targetDuration > 0
      ? Math.round(((state.targetDuration - state.timeRemaining) / state.targetDuration) * 100)
      : 0,
    startTimer,
    stopTimer,
    extendTimer,
    skipTimer,
    notificationPermission,
    requestNotificationPermission,
  }), [
    state.isRunning,
    state.timeRemaining,
    state.targetDuration,
    startTimer,
    stopTimer,
    extendTimer,
    skipTimer,
    notificationPermission,
    requestNotificationPermission,
  ]);

  return (
    <TimerContext.Provider value={value}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return context;
}
