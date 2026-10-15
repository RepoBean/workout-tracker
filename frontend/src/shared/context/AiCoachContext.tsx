import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { stableJson } from '../lib/settingsSync';
import { useServerBacked } from './SettingsSyncContext';

export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'custom';

export const PROVIDER_IDS: ProviderId[] = ['anthropic', 'openai', 'openrouter', 'google', 'custom'];

export interface AiCoachSettings {
  enabled: boolean;
  provider: ProviderId;
  apiKey: string;
  /** Model id the user selected from the provider's list (empty until chosen). */
  model: string;
  /** Only user-editable for the `custom` provider. */
  baseUrl: string;
}

interface AiCoachContextValue {
  settings: AiCoachSettings;
  setSettings: (settings: AiCoachSettings) => void;
}

const AiCoachContext = createContext<AiCoachContextValue | undefined>(undefined);

const STORAGE_KEY = 'workout-tracker-ai-coach';

export const DEFAULT_AI_COACH: AiCoachSettings = {
  enabled: false,
  provider: 'anthropic',
  apiKey: '',
  model: '',
  baseUrl: '',
};

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as string[]).includes(value);
}

function normalizeSettings(value: unknown): AiCoachSettings {
  const obj = (value && typeof value === 'object' ? value : {}) as Partial<AiCoachSettings>;
  return {
    enabled: obj.enabled === true,
    provider: isProviderId(obj.provider) ? obj.provider : DEFAULT_AI_COACH.provider,
    apiKey: typeof obj.apiKey === 'string' ? obj.apiKey : '',
    model: typeof obj.model === 'string' ? obj.model : '',
    baseUrl: typeof obj.baseUrl === 'string' ? obj.baseUrl : '',
  };
}

function parseSettings(raw: string | null): AiCoachSettings {
  if (!raw) return DEFAULT_AI_COACH;
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_AI_COACH;
  }
}

function saveSettings(settings: AiCoachSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}

const DEFAULT_JSON = stableJson(DEFAULT_AI_COACH);

export function AiCoachProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<AiCoachSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_AI_COACH;
    return parseSettings(localStorage.getItem(STORAGE_KEY));
  });

  // The whole object syncs, model included: one coach config per instance (C2 D1).
  const { changed } = useServerBacked({
    key: 'aiCoach',
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

  const setSettings = useCallback((next: AiCoachSettings) => {
    setSettingsState(next);
    saveSettings(next);
    changed(next);
  }, [changed]);

  return (
    <AiCoachContext.Provider value={{ settings, setSettings }}>
      {children}
    </AiCoachContext.Provider>
  );
}

export function useAiCoach() {
  const context = useContext(AiCoachContext);
  if (!context) {
    throw new Error('useAiCoach must be used within an AiCoachProvider');
  }
  return context;
}

/** True when the coach is enabled and minimally configured (key + model present). */
export function isCoachReady(settings: AiCoachSettings): boolean {
  return settings.enabled && settings.apiKey.trim().length > 0 && settings.model.trim().length > 0;
}
