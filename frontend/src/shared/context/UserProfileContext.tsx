import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { DEFAULT_PROFILE, UserProfile } from '../lib/hrZones';
import { stableJson } from '../lib/settingsSync';
import { useServerBacked } from './SettingsSyncContext';

interface UserProfileContextValue {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
}

const UserProfileContext = createContext<UserProfileContextValue | undefined>(undefined);

const STORAGE_KEY = 'workout-tracker-profile';

function normalizeProfile(value: unknown): UserProfile {
  const obj = (value && typeof value === 'object' ? value : {}) as Partial<UserProfile>;
  return {
    dob: typeof obj.dob === 'string' ? obj.dob : null,
    sex: obj.sex === 'male' || obj.sex === 'female' ? obj.sex : 'unspecified',
    restingHr: typeof obj.restingHr === 'number' ? obj.restingHr : null,
    maxHrOverride: typeof obj.maxHrOverride === 'number' ? obj.maxHrOverride : null,
    bodyweight: typeof obj.bodyweight === 'number' ? obj.bodyweight : null,
  };
}

function parseProfile(raw: string | null): UserProfile {
  if (!raw) return DEFAULT_PROFILE;
  try {
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return DEFAULT_PROFILE;
  }
}

function saveProfile(profile: UserProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore quota errors
  }
}

/** What the server stores: everything but bodyweight, which stays per device until C3. */
function toServer({ bodyweight: _bodyweight, ...synced }: UserProfile) {
  return synced;
}

const DEFAULT_SYNCED_JSON = stableJson(toServer(DEFAULT_PROFILE));

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile>(() => {
    if (typeof window === 'undefined') return DEFAULT_PROFILE;
    return parseProfile(localStorage.getItem(STORAGE_KEY));
  });

  const { changed } = useServerBacked({
    key: 'profile',
    value: profile,
    toServer,
    isDefault: (p) => stableJson(toServer(p)) === DEFAULT_SYNCED_JSON,
    applyServer: (serverValue) => {
      const next = { ...normalizeProfile(serverValue), bodyweight: profile.bodyweight };
      setProfileState(next);
      saveProfile(next);
      return next;
    },
  });

  const setProfile = useCallback((next: UserProfile) => {
    setProfileState(next);
    saveProfile(next);
    changed(next);
  }, [changed]);

  return (
    <UserProfileContext.Provider value={{ profile, setProfile }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return context;
}
