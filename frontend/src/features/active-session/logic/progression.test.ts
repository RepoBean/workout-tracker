import { describe, expect, it } from 'vitest';
import { computeProgression, parseRepTarget } from './progression';

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

  it('keeps weight and aims for the top when partially topped', () => {
    const result = computeProgression({
      previousSets: [
        { weight: 100, reps: 12 },
        { weight: 100, reps: 10 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result).toMatchObject({ suggestedWeight: 100, suggestedReps: 12, ready: false });
  });

  it('does not bump when sets used different weights', () => {
    const result = computeProgression({
      previousSets: [
        { weight: 100, reps: 12 },
        { weight: 95, reps: 12 },
      ],
      targetReps: '8-12',
      incrementLbs: 5,
    });
    expect(result?.ready).toBe(false);
    expect(result?.suggestedWeight).toBe(100);
  });

  it('handles single-rep targets', () => {
    const result = computeProgression({
      previousSets: [{ weight: 225, reps: 5 }],
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
