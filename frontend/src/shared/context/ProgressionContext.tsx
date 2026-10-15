import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { stableJson } from '../lib/settingsSync';
import { useServerBacked } from './SettingsSyncContext';

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

function normalizeSettings(value: unknown): ProgressionSettings {
  const obj = (value && typeof value === 'object' ? value : {}) as Partial<ProgressionSettings>;
  const incrementLbs =
    typeof obj.incrementLbs === 'number' && obj.incrementLbs > 0
      ? obj.incrementLbs
      : DEFAULT_PROGRESSION.incrementLbs;
  return {
    enabled: obj.enabled === true,
    incrementLbs,
  };
}

function parseSettings(raw: string | null): ProgressionSettings {
  if (!raw) return DEFAULT_PROGRESSION;
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_PROGRESSION;
  }
}

function saveSettings(settings: ProgressionSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}

const DEFAULT_JSON = stableJson(DEFAULT_PROGRESSION);

export function ProgressionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<ProgressionSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_PROGRESSION;
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  });

  const { changed } = useServerBacked({
    key: 'progression',
    value: settings,
    toServer: (s) => s,
    isDefault: (s) => stableJson(s) === DEFAULT_JSON,
    applyServer: (serverValue) => {
      const next = normalizeSettings(serverValue);
      setSettingsState(next);
      saveSettings(next);
      return next;
    },
  });

  const setSettings = useCallback((next: ProgressionSettings) => {
    setSettingsState(next);
    saveSettings(next);
    changed(next);
  }, [changed]);

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
