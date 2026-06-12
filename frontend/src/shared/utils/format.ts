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

/**
 * Parse a user-entered duration string into whole seconds.
 * Accepts `m:ss` / `h:mm:ss` (e.g. "32:14", "1:02:30") or plain/decimal
 * minutes (e.g. "30", "32.5" -> 1950). Returns null when the input is
 * empty, malformed, or non-positive.
 */
export function parseDurationToSec(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (s.includes(':')) {
    const parts = s.split(':');
    if (parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) return null;
    const nums = parts.map(p => parseInt(p, 10));
    if (nums.slice(1).some(n => n > 59)) return null;
    const sec = nums.reduce((acc, n) => acc * 60 + n, 0);
    return sec > 0 ? sec : null;
  }
  const mins = Number(s);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  return Math.round(mins * 60);
}
