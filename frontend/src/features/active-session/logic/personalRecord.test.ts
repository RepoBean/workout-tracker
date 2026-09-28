import { describe, expect, it } from 'vitest';
import { computeBestOneRepMax, epleyOneRepMax } from './personalRecord';

const set = (weight: number, reps: number, extra: Partial<{ dropIndex: number; durationSec: number }> = {}) => ({
  weight, reps, durationSec: extra.durationSec ?? null, distance: null, dropIndex: extra.dropIndex ?? 0,
});

describe('computeBestOneRepMax', () => {
  it('takes the best Epley 1RM over working strength sets', () => {
    expect(computeBestOneRepMax([set(100, 10), set(120, 5)], null)).toBe(epleyOneRepMax(120, 5));
  });

  it('ignores drop sets, cardio sets and 0-weight sets', () => {
    expect(computeBestOneRepMax([
      set(200, 10, { dropIndex: 1 }),
      set(0, 0, { durationSec: 600 }),
      set(0, 12),
    ], 185)).toBe(0);
  });

  it('scores an assisted set at effective load', () => {
    expect(computeBestOneRepMax([set(-40, 8)], 185)).toBe(epleyOneRepMax(145, 8));
  });

  it('excludes assisted sets when no bodyweight is on file', () => {
    expect(computeBestOneRepMax([set(-40, 8)], null)).toBe(0);
  });

  it('puts assisted and hand-entered effective sets on one scale', () => {
    // History logged as effective 145×8 before the notation existed; −40 at 185 bw is the same lift.
    expect(computeBestOneRepMax([set(145, 8)], 185)).toBe(computeBestOneRepMax([set(-40, 8)], 185));
  });
});
