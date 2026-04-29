/**
 * Format a number of seconds as `m:ss` (e.g. 90 -> "1:30").
 * Used for cardio elapsed time, set-level duration display, and similar
 * short-form duration readouts. Negative inputs and fractional seconds
 * are not handled — callers are expected to pass non-negative integers.
 */
export function formatMMSS(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
