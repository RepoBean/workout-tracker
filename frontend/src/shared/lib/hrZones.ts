export type Sex = 'male' | 'female' | 'unspecified';

export interface UserProfile {
  dob: string | null;
  sex: Sex;
  restingHr: number | null;
  maxHrOverride: number | null;
}

export const DEFAULT_PROFILE: UserProfile = {
  dob: null,
  sex: 'unspecified',
  restingHr: null,
  maxHrOverride: null,
};

export const PROFILE_LIMITS = {
  age: { min: 10, max: 120 },
  restingHr: { min: 30, max: 100 },
  maxHrOverride: { min: 100, max: 220 },
} as const;

const DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function computeAge(dob: string | null, now: Date = new Date()): number | null {
  if (!dob || !DOB_PATTERN.test(dob)) return null;
  const birth = new Date(`${dob}T00:00:00`);
  if (isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function isValidDob(dob: string): boolean {
  const age = computeAge(dob);
  if (age == null) return false;
  return age >= PROFILE_LIMITS.age.min && age <= PROFILE_LIMITS.age.max;
}

export function isValidRestingHr(bpm: number): boolean {
  return (
    Number.isFinite(bpm) &&
    bpm >= PROFILE_LIMITS.restingHr.min &&
    bpm <= PROFILE_LIMITS.restingHr.max
  );
}

export function isValidMaxHrOverride(bpm: number): boolean {
  return (
    Number.isFinite(bpm) &&
    bpm >= PROFILE_LIMITS.maxHrOverride.min &&
    bpm <= PROFILE_LIMITS.maxHrOverride.max
  );
}

/**
 * Returns estimated max HR. Override always wins. Gulati for female (lower
 * than Tanaka, avoids overestimating women by ~9-13 bpm); Tanaka otherwise.
 * Returns null only when age is unset and no override is provided.
 */
export function estimateMaxHr(profile: UserProfile): number | null {
  if (profile.maxHrOverride != null) return profile.maxHrOverride;
  const age = computeAge(profile.dob);
  if (age == null) return null;
  if (profile.sex === 'female') return 206 - 0.88 * age;
  return 208 - 0.7 * age;
}

export type ZoneNumber = 0 | 1 | 2 | 3 | 4 | 5;

export interface ZoneResult {
  zone: ZoneNumber;
  name: string;
  colorClass: string;
  percent: number;
  overMax: boolean;
}

const ZONE_DEFS: Array<{ zone: ZoneNumber; name: string; colorClass: string; min: number }> = [
  { zone: 0, name: 'Warm-up', colorClass: 'text-gray-500 dark:text-gray-400', min: 0 },
  { zone: 1, name: 'Z1', colorClass: 'text-blue-600 dark:text-blue-400', min: 0.5 },
  { zone: 2, name: 'Z2', colorClass: 'text-green-600 dark:text-green-400', min: 0.6 },
  { zone: 3, name: 'Z3', colorClass: 'text-yellow-600 dark:text-yellow-400', min: 0.7 },
  { zone: 4, name: 'Z4', colorClass: 'text-orange-600 dark:text-orange-400', min: 0.8 },
  { zone: 5, name: 'Z5', colorClass: 'text-red-600 dark:text-red-400', min: 0.9 },
];

/**
 * Map a live BPM to a training zone. Caller must ensure profile.age is set
 * (or maxHrOverride). With restingHr present, uses Karvonen (HR reserve);
 * otherwise %max. BPM above max clamps to Z5 with overMax=true.
 */
export function getZone(bpm: number, profile: UserProfile): ZoneResult | null {
  const maxHr = estimateMaxHr(profile);
  if (maxHr == null || maxHr <= 0) return null;

  let fraction: number;
  if (profile.restingHr != null && profile.restingHr < maxHr) {
    const reserve = maxHr - profile.restingHr;
    fraction = (bpm - profile.restingHr) / reserve;
  } else {
    fraction = bpm / maxHr;
  }

  const overMax = bpm > maxHr;
  const percent = fraction * 100;

  let match = ZONE_DEFS[0];
  for (const def of ZONE_DEFS) {
    if (fraction >= def.min) match = def;
  }

  return {
    zone: match.zone,
    name: match.name,
    colorClass: match.colorClass,
    percent,
    overMax,
  };
}
