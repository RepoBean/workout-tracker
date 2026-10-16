// Shared by the Body tab's log form and its row editor.
import { PROFILE_LIMITS } from '../../../shared/lib/hrZones';
import { localDateKey } from '../../../shared/lib/localDate';

/** The server allows up to tomorrow (time-zone slack); the picker stops at today. */
export function latestLoggableDate(now: Date = new Date()): string {
  return localDateKey(now);
}

/** A weight in lbs, or the error message to show. */
export function parseWeighInWeight(raw: string): number | string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Enter a weight';
  const n = Number(trimmed);
  const { min, max } = PROFILE_LIMITS.bodyweight;
  if (!Number.isFinite(n) || n < min || n > max) return `Bodyweight must be ${min}–${max} lbs`;
  return Math.round(n * 10) / 10;
}
