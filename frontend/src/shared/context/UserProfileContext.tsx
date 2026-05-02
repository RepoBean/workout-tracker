import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { DEFAULT_PROFILE, UserProfile } from '../lib/hrZones';

interface UserProfileContextValue {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
}

const UserProfileContext = createContext<UserProfileContextValue | undefined>(undefined);

const STORAGE_KEY = 'workout-tracker-profile';

function parseProfile(raw: string | null): UserProfile {
  if (!raw) return DEFAULT_PROFILE;
  try {
    const obj = JSON.parse(raw) as Partial<UserProfile>;
    return {
      dob: typeof obj.dob === 'string' ? obj.dob : null,
      sex: obj.sex === 'male' || obj.sex === 'female' ? obj.sex : 'unspecified',
      restingHr: typeof obj.restingHr === 'number' ? obj.restingHr : null,
      maxHrOverride: typeof obj.maxHrOverride === 'number' ? obj.maxHrOverride : null,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile>(() => {
    if (typeof window === 'undefined') return DEFAULT_PROFILE;
    return parseProfile(localStorage.getItem(STORAGE_KEY));
  });

  const setProfile = useCallback((next: UserProfile) => {
    setProfileState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }, []);

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
