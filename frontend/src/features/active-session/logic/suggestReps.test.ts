import { describe, expect, it } from 'vitest';
import { suggestReps, type RepSetLike } from './suggestReps';

/** Build a set list from `weight x reps` pairs, numbered from 1. */
function sets(weight: number, ...reps: number[]): RepSetLike[] {
  return reps.map((r, i) => ({ setNumber: i + 1, weight, reps: r }));
}

/** Run the whole exercise: suggest set N, "log" it at the suggested reps, repeat. */
function walkSession(opts: {
  targetReps: string;
  previousSets: RepSetLike[];
  weight: number;
  count: number;
}): number[] {
  const logged: RepSetLike[] = [];
  const out: number[] = [];
  for (let n = 1; n <= opts.count; n++) {
    const reps = suggestReps({
      setNumber: n,
      targetReps: opts.targetReps,
      previousSets: opts.previousSets,
      currentSessionSets: logged,
      plannedWeight: opts.weight,
    });
    out.push(reps);
    logged.push({ setNumber: n, weight: opts.weight, reps });
  }
  return out;
}

describe('suggestReps', () => {
  it('matches the previous session set-for-set', () => {
    // Set 1 already tops the range, so the bump is suppressed.
    expect(
      walkSession({ targetReps: '8-12', previousSets: sets(40, 12, 10, 8), weight: 40, count: 3 })
    ).toEqual([12, 10, 8]);
  });

  it('bumps set 1 by one and leaves fatigued sets honest', () => {
    // The reported regression: 8/6/6 must not become 9/8/8.
    expect(
      walkSession({ targetReps: '8-12', previousSets: sets(50, 8, 6, 6), weight: 50, count: 3 })
    ).toEqual([9, 6, 6]);
  });

  it('never floors sets 2+ up to the bottom of the range', () => {
    // 8s are below the 10-12 range; they stay 8, they do not get inflated to 10.
    expect(
      walkSession({ targetReps: '10-12', previousSets: sets(70, 9, 8, 8), weight: 70, count: 3 })
    ).toEqual([10, 8, 8]);
  });

  it('handles the 8/8/7 case', () => {
    expect(
      walkSession({ targetReps: '8-12', previousSets: sets(40, 8, 8, 7), weight: 40, count: 3 })
    ).toEqual([9, 8, 7]);
  });

  it('suppresses the bump when set 1 is already at the top of the range', () => {
    expect(
      suggestReps({
        setNumber: 1,
        targetReps: '8-12',
        previousSets: sets(100, 12),
        currentSessionSets: [],
        plannedWeight: 100,
      })
    ).toBe(12);
  });

  it('never bumps sets 2+', () => {
    expect(
      suggestReps({
        setNumber: 2,
        targetReps: '8-12',
        previousSets: sets(100, 10, 10),
        currentSessionSets: [{ setNumber: 1, weight: 100, reps: 11 }],
        plannedWeight: 100,
      })
    ).toBe(10);
  });

  it('resets to the bottom of the range when the weight goes up', () => {
    expect(
      suggestReps({
        setNumber: 1,
        targetReps: '8-12',
        previousSets: sets(100, 12, 12),
        currentSessionSets: [],
        plannedWeight: 105,
      })
    ).toBe(8);
  });

  it('does not bump when the weight is dropped', () => {
    expect(
      suggestReps({
        setNumber: 1,
        targetReps: '8-12',
        previousSets: sets(100, 10),
        currentSessionSets: [],
        plannedWeight: 90,
      })
    ).toBe(10);
  });

  it('caps a set at what was just logged this session', () => {
    // Last session's set 2 was 12, but today's set 1 only managed 8 — reps fall.
    expect(
      suggestReps({
        setNumber: 2,
        targetReps: '8-12',
        previousSets: sets(100, 12, 12),
        currentSessionSets: [{ setNumber: 1, weight: 100, reps: 8 }],
        plannedWeight: 100,
      })
    ).toBe(8);
  });

  it('reuses the previous session\'s last set when today runs longer', () => {
    // Last session did 2 sets; today is on set 4.
    expect(
      suggestReps({
        setNumber: 4,
        targetReps: '8-12',
        previousSets: sets(100, 10, 9),
        currentSessionSets: [
          { setNumber: 1, weight: 100, reps: 11 },
          { setNumber: 2, weight: 100, reps: 10 },
          { setNumber: 3, weight: 100, reps: 9 },
        ],
        plannedWeight: 100,
      })
    ).toBe(9);
  });

  it('pins single-value targets instead of creeping', () => {
    expect(
      suggestReps({
        setNumber: 1,
        targetReps: '12',
        previousSets: sets(60, 12, 12),
        currentSessionSets: [],
        plannedWeight: 60,
      })
    ).toBe(12);
  });

  it('falls back to the range bottom on set 1 with no previous session', () => {
    expect(
      suggestReps({
        setNumber: 1,
        targetReps: '8-12',
        previousSets: [],
        currentSessionSets: [],
        plannedWeight: 45,
      })
    ).toBe(8);
  });

  it('follows this session when there is no previous session', () => {
    // Was falling through to the raw target, which made set 4 jump back UP.
    expect(
      suggestReps({
        setNumber: 4,
        targetReps: '8-12',
        previousSets: [],
        currentSessionSets: [
          { setNumber: 1, weight: 45, reps: 10 },
          { setNumber: 2, weight: 45, reps: 9 },
          { setNumber: 3, weight: 45, reps: 8 },
        ],
        plannedWeight: 45,
      })
    ).toBe(8);
  });

  it('is order-independent across unsorted input', () => {
    expect(
      suggestReps({
        setNumber: 3,
        targetReps: '8-12',
        previousSets: [
          { setNumber: 3, weight: 100, reps: 8 },
          { setNumber: 1, weight: 100, reps: 12 },
          { setNumber: 2, weight: 100, reps: 10 },
        ],
        currentSessionSets: [
          { setNumber: 2, weight: 100, reps: 10 },
          { setNumber: 1, weight: 100, reps: 12 },
        ],
        plannedWeight: 100,
      })
    ).toBe(8);
  });

  it('handles unparseable targets via parseRepTarget\'s {10,10} fallback', () => {
    expect(
      suggestReps({
        setNumber: 1,
        targetReps: 'AMRAP',
        previousSets: [],
        currentSessionSets: [],
        plannedWeight: 100,
      })
    ).toBe(10);
  });
});
