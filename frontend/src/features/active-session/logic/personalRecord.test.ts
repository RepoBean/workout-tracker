import { describe, expect, it } from 'vitest';
import { computeBestOneRepMax, epleyOneRepMax } from './personalRecord';
import { bodyweightLookup, constantBodyweight as bw } from '../../../shared/lib/bodyweight';

const set = (weight: number, reps: number, extra: Partial<{ dropIndex: number; durationSec: number }> = {}) => ({
  weight, reps, durationSec: extra.durationSec ?? null, distance: null, dropIndex: extra.dropIndex ?? 0, completedAt: null,
});

describe('computeBestOneRepMax', () => {
  it('takes the best Epley 1RM over working strength sets', () => {
    expect(computeBestOneRepMax([set(100, 10), set(120, 5)], bw(null))).toBe(epleyOneRepMax(120, 5));
  });

  it('ignores drop sets, cardio sets and 0-weight sets', () => {
    expect(computeBestOneRepMax([
      set(200, 10, { dropIndex: 1 }),
      set(0, 0, { durationSec: 600 }),
      set(0, 12),
    ], bw(185))).toBe(0);
  });

  it('scores an assisted set at effective load', () => {
    expect(computeBestOneRepMax([set(-40, 8)], bw(185))).toBe(epleyOneRepMax(145, 8));
  });

  it('excludes assisted sets when no bodyweight is on file', () => {
    expect(computeBestOneRepMax([set(-40, 8)], bw(null))).toBe(0);
  });

  it('scores each historical set at the bodyweight on its own day', () => {
    const at = bodyweightLookup([
      { date: '2026-01-01', weight: 200, updatedAt: '' },
      { date: '2026-09-01', weight: 180, updatedAt: '' },
    ], null);
    const old = { ...set(-40, 8), completedAt: '2026-03-01T18:00:00.000Z' }; // 160
    const recent = { ...set(-40, 8), completedAt: '2026-09-20T18:00:00.000Z' }; // 140
    expect(computeBestOneRepMax([recent, old], at)).toBe(epleyOneRepMax(160, 8));
  });

  it('puts assisted and hand-entered effective sets on one scale', () => {
    // History logged as effective 145×8 before the notation existed; −40 at 185 bw is the same lift.
    expect(computeBestOneRepMax([set(145, 8)], bw(185))).toBe(computeBestOneRepMax([set(-40, 8)], bw(185)));
  });
});
