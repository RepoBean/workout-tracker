import { describe, it, expect } from 'vitest';
import { bodyweightChange, bodyweightLookup, latestWeighIn, weighInFingerprint, type WeighIn } from './bodyweight';

const w = (date: string, weight: number, updatedAt = `${date}T12:00:00.000Z`): WeighIn => ({ date, weight, updatedAt });

/** ISO string (as the API sends it) for a local wall-clock time. */
const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h, 0).toISOString();

const LOG = [w('2026-10-10', 182), w('2026-06-01', 190), w('2026-08-15', 186)]; // unsorted on purpose

describe('bodyweightLookup', () => {
  const at_ = bodyweightLookup(LOG, 200);

  it('uses the latest weigh-in on or before the session day', () => {
    expect(at_(at(2026, 9, 1))).toBe(186);
    expect(at_(at(2026, 12, 25))).toBe(182);
    expect(at_(at(2026, 7, 4))).toBe(190);
  });

  it('counts a weigh-in on the session day itself', () => {
    expect(at_(at(2026, 8, 15, 6))).toBe(186);
  });

  it('back-applies the earliest weigh-in before the log starts', () => {
    expect(at_(at(2025, 3, 1))).toBe(190);
  });

  it('uses the local day: an 11 pm session is not on the next morning\'s weigh-in', () => {
    // 23:00 local is already the next day in UTC for any zone west of Greenwich.
    expect(at_(at(2026, 10, 9, 23))).toBe(186);
    expect(at_(at(2026, 8, 14, 23))).toBe(190);
  });

  it('null date = now: the latest weigh-in', () => {
    expect(at_(null)).toBe(182);
    expect(at_(undefined)).toBe(182);
  });

  it('falls back to the profile value with no weigh-ins', () => {
    expect(bodyweightLookup([], 175)(at(2026, 1, 1))).toBe(175);
    expect(bodyweightLookup([], null)(null)).toBeNull();
  });
});

describe('bodyweightChange', () => {
  it('compares with the latest weigh-in at or before the window start', () => {
    // 2026-10-10 − 90 d = 2026-07-12 → baseline 2026-06-01 (190)
    expect(bodyweightChange(LOG, 90)).toEqual({ delta: -8, days: 131 });
    // − 30 d = 2026-09-10 → baseline 2026-08-15 (186)
    expect(bodyweightChange(LOG, 30)).toEqual({ delta: -4, days: 56 });
  });

  it('uses the earliest when none is that old, over its real span', () => {
    const recent = [w('2026-10-01', 184.2), w('2026-10-10', 182.4)];
    expect(bodyweightChange(recent, 90)).toEqual({ delta: -1.8, days: 9 });
  });

  it('is null with fewer than two weigh-ins', () => {
    expect(bodyweightChange([w('2026-10-10', 182)], 90)).toBeNull();
    expect(bodyweightChange([], 90)).toBeNull();
  });
});

describe('weighInFingerprint / latestWeighIn', () => {
  it('changes on add, edit and delete', () => {
    const base = weighInFingerprint(LOG);
    expect(weighInFingerprint([...LOG, w('2026-10-11', 181)])).not.toBe(base);
    expect(weighInFingerprint([w('2026-10-10', 181, '2026-10-16T00:00:00.000Z'), LOG[1], LOG[2]])).not.toBe(base);
    expect(weighInFingerprint(LOG.slice(1))).not.toBe(base);
  });

  it('finds the newest by date', () => {
    expect(latestWeighIn(LOG)?.weight).toBe(182);
    expect(latestWeighIn([])).toBeNull();
  });
});
