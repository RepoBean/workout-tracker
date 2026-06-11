/**
 * Estimated one-rep max (Epley formula).
 *
 * Shared across the active-session PR celebration, the Progress page personal
 * records, and the AI Coach tools so every surface agrees on the number.
 */
export function epleyOneRepMax(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30));
}
