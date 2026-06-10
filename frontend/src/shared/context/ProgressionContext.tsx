import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

export interface ProgressionSettings {
  enabled: boolean;
  incrementLbs: number;
}

interface ProgressionContextValue {
  settings: ProgressionSettings;
  setSettings: (settings: ProgressionSettings) => void;
}

const ProgressionContext = createContext<ProgressionContextValue | undefined>(undefined);

const STORAGE_KEY = 'workout-tracker-progression';

export const DEFAULT_PROGRESSION: ProgressionSettings = { enabled: false, incrementLbs: 5 };

function parseSettings(raw: string | null): ProgressionSettings {
  if (!raw) return DEFAULT_PROGRESSION;
  try {
    const obj = JSON.parse(raw) as Partial<ProgressionSettings>;
    const incrementLbs =
      typeof obj.incrementLbs === 'number' && obj.incrementLbs > 0
        ? obj.incrementLbs
        : DEFAULT_PROGRESSION.incrementLbs;
    return {
      enabled: obj.enabled === true,
      incrementLbs,
    };
  } catch {
    return DEFAULT_PROGRESSION;
  }
}

export function ProgressionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<ProgressionSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_PROGRESSION;
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  });

  const setSettings = useCallback((next: ProgressionSettings) => {
    setSettingsState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }, []);

  return (
    <ProgressionContext.Provider value={{ settings, setSettings }}>
      {children}
    </ProgressionContext.Provider>
  );
}

export function useProgression() {
  const context = useContext(ProgressionContext);
  if (!context) {
    throw new Error('useProgression must be used within a ProgressionProvider');
  }
  return context;
}
