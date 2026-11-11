import { describe, expect, it } from 'vitest';
import {
  computeProgression, couldDeload, deloadWeight, goalReps, historyFromSets, learnedStep, parseRepTarget, repAllowance,
} from './progression';
import type { DayTop } from '../../../shared/lib/liftTrend';

describe('parseRepTarget', () => {
  it('parses a range', () => {
    expect(parseRepTarget('8-12')).toEqual({ low: 8, high: 12 });
  });

  it('parses a single value', () => {
    expect(parseRepTarget('5')).toEqual({ low: 5, high: 5 });
  });

  it('normalizes reversed ranges', () => {
    expect(parseRepTarget('12-8')).toEqual({ low: 8, high: 12 });
  });

  it('falls back to {10,10} when unparseable', () => {
    expect(parseRepTarget('AMRAP')).toEqual({ low: 10, high: 10 });
  });
});

describe('computeProgression', () => {
  it('returns null with no previous sets', () => {
    expect(
      computeProgression({ previousSets: [], targetReps: '8-12', incrementLbs: 5 })
    ).toBeNull();
  });

  it('bumps weight when every set tops the range at one weight', () => {
    const result = computeProgression({
      previousSets: [
        { weight: 100, reps: 12 },
        { weight: 100, reps: 12 },
        { weight: 100, reps: 12 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ suggestedWeight: 105, suggestedReps: 8, ready: true });
    expect(result?.reason).toContain('105');
  });

  it('treats reps above the top of the range as topped out', () => {
    const result = computeProgression({
      previousSets: [{ weight: 100, reps: 13 }],
      targetReps: '8-12',
      incrementLbs: 10,
    });
    expect(result).toMatchObject({ suggestedWeight: 110, ready: true });
  });

  it('bumps when set 1 tops the range and the rest reach the goal (12/10 on 8-12, +5%)', () => {
    const result = computeProgression({
      previousSets: [
        { weight: 100, reps: 12 },
        { weight: 100, reps: 10 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ kind: 'up', suggestedWeight: 105, suggestedReps: 8, ready: true });
  });

  it('keeps the weight when set 1 is short of the top, even if a later set reached it', () => {
    const result = computeProgression({
      previousSets: [
        { weight: 100, reps: 11 },
        { weight: 100, reps: 12 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ kind: 'hold', suggestedWeight: 100, suggestedReps: 12, ready: false });
    expect(result?.reason).toBe('Aim 100×12 on set 1, rest 9+ → then 105');
    expect(result).toMatchObject({ goalReps: 9, nextWeight: 105 });
  });

  it('keeps the weight when a set fell out of the range (12/10/7 on 8-12)', () => {
    const result = computeProgression({
      previousSets: [
        { weight: 100, reps: 12 },
        { weight: 100, reps: 10 },
        { weight: 100, reps: 7 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ kind: 'hold', suggestedWeight: 100, ready: false });
  });

  it('replayed from main: 35 lb OHP 12/8/8 on 8-12 holds (+14% needs every set at 10; it went 40×10/9/6)', () => {
    const result = computeProgression({
      previousSets: [
        { weight: 35, reps: 12, setNumber: 1 },
        { weight: 35, reps: 8, setNumber: 2 },
        { weight: 35, reps: 8, setNumber: 3 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ kind: 'hold', suggestedWeight: 35, goalReps: 10 });
    expect(result?.reason).toBe('Aim 35×12 on set 1, rest 10+ → then 40');
  });

  it('35 lb OHP 12/11/10 on 8-12 goes up', () => {
    const result = computeProgression({
      previousSets: [{ weight: 35, reps: 12 }, { weight: 35, reps: 11 }, { weight: 35, reps: 10 }],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ kind: 'up', suggestedWeight: 40, suggestedReps: 8 });
    expect(result?.reason).toBe('Last: 35×12 → Try: 40 ↑');
  });

  it('a small step needs less: leg curl 80 on 10-12, +2.5', () => {
    const at = (reps: number[]) => computeProgression({
      previousSets: reps.map((r) => ({ weight: 80, reps: r })),
      targetReps: '10-12',
      incrementLbs: 2.5,
    });
    expect(at([12, 10, 11])).toMatchObject({ kind: 'hold', goalReps: 11 });
    expect(at([12, 11, 11])).toMatchObject({ kind: 'up', suggestedWeight: 82.5 });
  });

  it('a jump too big for the range pushes the goal past its top (lateral raise 10 → 15)', () => {
    const at = (reps: number[]) => computeProgression({
      previousSets: reps.map((r) => ({ weight: 10, reps: r })),
      targetReps: '10-15',
      incrementLbs: 5,
    });
    const hold = at([15, 15, 14]);
    expect(hold).toMatchObject({ kind: 'hold', goalReps: 18, suggestedReps: 16 });
    expect(hold?.reason).toBe('Aim 10×18 on every set → then 15');
    expect(at([18, 18, 17])).toMatchObject({ kind: 'hold' });
    expect(at([18, 18, 18])).toMatchObject({ kind: 'up', suggestedWeight: 15, suggestedReps: 10 });
  });

  it('caps the goal at 30 reps', () => {
    const result = computeProgression({
      previousSets: [{ weight: 2, reps: 30 }, { weight: 2, reps: 30 }],
      targetReps: '15-20',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ kind: 'up', goalReps: 30 });
  });

  it('uses the exercise step it is given', () => {
    const result = computeProgression({
      previousSets: [{ weight: 145, reps: 8 }, { weight: 145, reps: 8 }],
      targetReps: '5-8',
      incrementLbs: 10,
    });
    expect(result?.suggestedWeight).toBe(155);
  });

  it('pre-fills set 1 from last performance, not the top of the range', () => {
    // Regression: this branch used to return `suggestedReps: high` (12 here) regardless of
    // what was actually done — the worst-scoring rule tested (set-1 MAE 2.32).
    const result = computeProgression({
      previousSets: [
        { weight: 100, reps: 8 },
        { weight: 100, reps: 8 },
        { weight: 100, reps: 7 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ suggestedWeight: 100, suggestedReps: 9, ready: false });
    // The goal copy still names the top of the range — only the pre-filled number changed.
    expect(result?.reason).toBe('Aim 100×12 on set 1, rest 9+ → then 105');
  });

  it('respects explicit setNumber when the caller supplies it', () => {
    // Sets arriving out of order must still anchor set 1 on the real set 1.
    const result = computeProgression({
      previousSets: [
        { weight: 100, reps: 6, setNumber: 3 },
        { weight: 100, reps: 9, setNumber: 1 },
        { weight: 100, reps: 7, setNumber: 2 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result?.suggestedReps).toBe(10);
  });

  it('judges on the heaviest-weight sets; ramp-up sets do not count', () => {
    // Squat logged as 95/115/135×8 on 5-8: the 135 set topped the range.
    const result = computeProgression({
      previousSets: [
        { weight: 95, reps: 8 },
        { weight: 115, reps: 8 },
        { weight: 135, reps: 8 },
      ],
      targetReps: '5-8',
      incrementLbs: 10,
    });
    expect(result).toMatchObject({ kind: 'up', suggestedWeight: 145 });
  });

  it('holds at the heaviest weight, not the first set\'s', () => {
    const result = computeProgression({
      previousSets: [
        { weight: 95, reps: 8 },
        { weight: 135, reps: 6 },
      ],
      targetReps: '5-8',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ kind: 'hold', suggestedWeight: 135 });
  });

  it('a fixed target needs one rep over it on every set (the rep the next weight costs)', () => {
    const result = computeProgression({
      previousSets: [{ weight: 155, reps: 5 }, { weight: 155, reps: 5 }],
      targetReps: '5',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ kind: 'hold', suggestedWeight: 155, suggestedReps: 6 });
    expect(result?.reason).toBe('Aim 155×6 on every set → then 160');
  });

  it('handles single-rep targets', () => {
    const result = computeProgression({
      previousSets: [{ weight: 225, reps: 6 }],
      targetReps: '5',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ suggestedWeight: 230, suggestedReps: 5, ready: true });
  });

  it('ignores drop sets', () => {
    const result = computeProgression({
      previousSets: [
        { weight: 100, reps: 12, dropIndex: 0 },
        { weight: 80, reps: 8, dropIndex: 1 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ suggestedWeight: 105, ready: true });
  });
});

describe('computeProgression — assisted (negative weight) lifts', () => {
  it('suggests less assistance when the range is topped out (−40 → −35)', () => {
    const result = computeProgression({
      previousSets: [
        { weight: -40, reps: 12 },
        { weight: -40, reps: 12 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ suggestedWeight: -35, suggestedReps: 8, ready: true });
    expect(result?.reason).toBe('Last: −40×12 → Try: −35 ↑');
  });

  it('keeps the assistance when not topped out', () => {
    const result = computeProgression({
      previousSets: [
        { weight: -40, reps: 10 },
        { weight: -40, reps: 9 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ suggestedWeight: -40, ready: false });
  });
});

describe('computeProgression — assisted, new rule', () => {
  it('−40×10/10/8 on 6-10 → −35', () => {
    const result = computeProgression({
      previousSets: [{ weight: -40, reps: 10 }, { weight: -40, reps: 10 }, { weight: -40, reps: 8 }],
      targetReps: '6-10',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ kind: 'up', suggestedWeight: -35 });
  });

  it('mixed assistance: the least-assisted sets are the top weight', () => {
    const result = computeProgression({
      previousSets: [{ weight: -40, reps: 10 }, { weight: -30, reps: 8 }, { weight: -35, reps: 8 }],
      targetReps: '6-10',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ kind: 'hold', suggestedWeight: -30 });
  });

  it('sizes the jump on bodyweight minus assistance', () => {
    const at = (bodyweight: number | null) => computeProgression({
      previousSets: [{ weight: -40, reps: 10 }, { weight: -40, reps: 7 }],
      targetReps: '6-10',
      incrementLbs: 10,
      bodyweight,
    });
    // 10 / (120 − 40) = 12.5% → 2 reps; 10 / (180 − 40) = 7% → 1; no bodyweight → the minimum.
    expect(at(120)).toMatchObject({ kind: 'hold', goalReps: 8 });
    expect(at(180)).toMatchObject({ kind: 'up', goalReps: 7, suggestedWeight: -30 });
    expect(at(null)).toMatchObject({ kind: 'up', goalReps: 7 });
  });
});

describe('repAllowance / goalReps', () => {
  it.each([
    [2.5, 80, 1], [10, 155, 1], [5, 45, 2], [5, 35, 2], [5, 25, 3], [5, 15, 5], [5, 10, 8],
    [5, 0, 1], [5, -40, 1], [0, 100, 1],
  ])('step %d on %d → %d', (step, load, expected) => {
    expect(repAllowance(step, load)).toBe(expected);
  });

  it('goal = low + allowance, capped at 30, never below low', () => {
    expect(goalReps(8, 5, 35)).toBe(10);
    expect(goalReps(20, 5, 2)).toBe(30);
    expect(goalReps(40, 5, 100)).toBe(40);
  });
});

describe('learnedStep', () => {
  const hist = (weights: number[]) =>
    new Map<string, DayTop>(weights.map((w, i) => [`2026-01-${String(i + 1).padStart(2, '0')}`, { weight: w, bestReps: 10, totalReps: 30 }]));

  it('null without a bump', () => {
    expect(learnedStep(hist([]))).toBeNull();
    expect(learnedStep(hist([50, 50, 45]))).toBeNull();
  });

  it('the most common recent increase', () => {
    expect(learnedStep(hist([70, 75, 77.5, 77.5, 80, 82.5]))).toBe(2.5);
  });

  it('only the last 5 bumps count; a tie goes to the most recent', () => {
    expect(learnedStep(hist([10, 20, 30, 40, 45, 50, 55, 60, 65]))).toBe(5);
    expect(learnedStep(hist([100, 110, 105, 110]))).toBe(5);
  });
});

describe('deloadWeight', () => {
  it.each([
    [225, 200],
    [145, 130],
    [135, 120],
    [100, 90],
    [-30, -35],
    [-40, -45],
    [10, 10], // 9 rounds back to 10: no deload
    [20, 20], // 18 → 20
    [25, 20], // 22.5 → tie goes lighter
  ])('%s → %s', (w, expected) => {
    expect(deloadWeight(w)).toBe(expected);
  });
});

describe('computeProgression — deload', () => {
  const day = (weight: number, bestReps: number, totalReps: number): DayTop => ({ weight, bestReps, totalReps });
  const stalled = new Map<string, DayTop>([
    ['2026-09-01', day(225, 5, 13)],
    ['2026-09-04', day(225, 4, 12)],
    ['2026-09-08', day(225, 4, 11)],
  ]);
  const below = [{ weight: 225, reps: 4 }, { weight: 225, reps: 4 }, { weight: 225, reps: 3 }];

  it('stalled 3 sessions and below the range → −10%', () => {
    const result = computeProgression({ previousSets: below, targetReps: '5-8', incrementLbs: 5, history: stalled });
    expect(result).toMatchObject({ kind: 'deload', suggestedWeight: 200, ready: false });
    expect(result?.reason).toBe('Stuck at 225 for 3 sessions → Try: 200 ↓');
    expect(result?.suggestedReps).toBeGreaterThanOrEqual(5);
  });

  it('no history → no deload', () => {
    const result = computeProgression({ previousSets: below, targetReps: '5-8', incrementLbs: 5 });
    expect(result?.kind).toBe('hold');
  });

  it('stalled but still in the range → hold, not deload', () => {
    const inRange = [{ weight: 225, reps: 6 }, { weight: 225, reps: 5 }];
    const result = computeProgression({ previousSets: inRange, targetReps: '5-8', incrementLbs: 5, history: stalled });
    expect(result?.kind).toBe('hold');
  });

  it('below the range but only 2 sessions at the weight → hold', () => {
    const two = new Map([...stalled].slice(1));
    const result = computeProgression({ previousSets: below, targetReps: '5-8', incrementLbs: 5, history: two });
    expect(result?.kind).toBe('hold');
  });

  it('a light lift that would round back to itself → hold', () => {
    const light = new Map<string, DayTop>([
      ['2026-09-01', day(10, 8, 20)], ['2026-09-04', day(10, 7, 19)], ['2026-09-08', day(10, 7, 18)],
    ]);
    const result = computeProgression({
      previousSets: [{ weight: 10, reps: 7 }, { weight: 10, reps: 6 }],
      targetReps: '10-15', incrementLbs: 5, history: light,
    });
    expect(result?.kind).toBe('hold');
  });

  it('the history stalled at another weight → no deload', () => {
    const result = computeProgression({
      previousSets: [{ weight: 230, reps: 4 }], targetReps: '5-8', incrementLbs: 5, history: stalled,
    });
    expect(result?.kind).toBe('hold');
  });
});

describe('couldDeload / historyFromSets', () => {
  it('only when the best top-weight set is below the range', () => {
    expect(couldDeload([{ weight: 225, reps: 4 }, { weight: 225, reps: 3 }], '5-8')).toBe(true);
    expect(couldDeload([{ weight: 225, reps: 5 }, { weight: 225, reps: 3 }], '5-8')).toBe(false);
    expect(couldDeload([{ weight: 95, reps: 8 }, { weight: 135, reps: 4 }], '5-8')).toBe(true);
    expect(couldDeload([], '5-8')).toBe(false);
  });

  it('groups by local day on the raw weight, skipping drops and cardio', () => {
    const map = historyFromSets([
      { weight: -40, reps: 8, dropIndex: 0, completedAt: '2026-09-18T15:00:00.000Z' },
      { weight: -40, reps: 10, dropIndex: 0, completedAt: '2026-09-18T15:00:00.000Z' },
      { weight: -50, reps: 12, dropIndex: 0, completedAt: '2026-09-18T15:00:00.000Z' },
      { weight: -60, reps: 6, dropIndex: 1, completedAt: '2026-09-18T15:00:00.000Z' },
      { weight: 0, reps: 0, dropIndex: 0, durationSec: 600, completedAt: '2026-09-18T15:00:00.000Z' },
      { weight: -40, reps: 8, dropIndex: 0, completedAt: null },
    ]);
    expect([...map.values()]).toEqual([{ weight: -40, bestReps: 10, totalReps: 18 }]);
  });
});
