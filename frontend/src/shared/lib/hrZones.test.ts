import { describe, expect, it } from 'vitest';
import { computeTimeInZone, type UserProfile } from './hrZones';

// 30-year-old male, no resting HR override → Tanaka maxHr = 208 - 0.7*30 = 187
// %max thresholds: Z1>=50%(94), Z2>=60%(112), Z3>=70%(131), Z4>=80%(150), Z5>=90%(168)
const profile30M: UserProfile = {
  dob: '1996-01-01',
  sex: 'male',
  restingHr: null,
  maxHrOverride: null,
};

const noAge: UserProfile = {
  dob: null,
  sex: 'unspecified',
  restingHr: null,
  maxHrOverride: null,
};

describe('computeTimeInZone', () => {
  it('returns null when maxHr cannot be computed', () => {
    expect(computeTimeInZone({ t: [0, 60], b: [120, 120] }, noAge)).toBeNull();
  });

  it('returns zeroed breakdown for empty series', () => {
    const r = computeTimeInZone({ t: [], b: [] }, profile30M);
    expect(r?.totalSeconds).toBe(0);
    expect(r?.breakdown).toHaveLength(6);
    expect(r?.breakdown.every((e) => e.seconds === 0)).toBe(true);
  });

  it('returns zeroed breakdown for single sample (no interval)', () => {
    const r = computeTimeInZone({ t: [0], b: [150] }, profile30M);
    expect(r?.totalSeconds).toBe(0);
  });

  it('attributes each interval to the leading samples zone', () => {
    // 0s: 80bpm (Z0), 30s: 120bpm (Z2), 90s: 160bpm (Z4), 120s: end
    // Intervals: 0-30 → Z0 (30s), 30-90 → Z2 (60s), 90-120 → Z4 (30s)
    const r = computeTimeInZone(
      { t: [0, 30, 90, 120], b: [80, 120, 160, 170] },
      profile30M,
    );
    expect(r?.totalSeconds).toBe(120);
    expect(r?.breakdown[0].seconds).toBe(30);
    expect(r?.breakdown[2].seconds).toBe(60);
    expect(r?.breakdown[4].seconds).toBe(30);
    expect(r?.breakdown[1].seconds).toBe(0);
    expect(r?.breakdown[3].seconds).toBe(0);
    expect(r?.breakdown[5].seconds).toBe(0);
  });

  it('skips non-positive deltas', () => {
    const r = computeTimeInZone(
      { t: [0, 0, 30], b: [120, 120, 120] },
      profile30M,
    );
    expect(r?.totalSeconds).toBe(30);
  });

  it('breakdown is ordered Z0..Z5', () => {
    const r = computeTimeInZone({ t: [0, 1], b: [80, 80] }, profile30M);
    expect(r?.breakdown.map((e) => e.zone)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
