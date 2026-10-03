/**
 * Estimated one-rep max (Epley formula).
 *
 * Shared across the active-session PR celebration, the Progress page personal
 * records, and the AI Coach tools so every surface agrees on the number.
 * A single is its own 1RM (raw Epley would inflate it by 1/30).
 */
export function epleyOneRepMax(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}
