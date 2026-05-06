import { describe, expect, it } from 'vitest';
import { averageRpe } from './averageRpe';

describe('averageRpe', () => {
  it('returns null when no sets have RPE', () => {
    expect(
      averageRpe([
        { perceivedEffort: null, dropIndex: 0 },
        { perceivedEffort: null, dropIndex: 0 },
      ])
    ).toBe(null);
  });

  it('returns null for empty input', () => {
    expect(averageRpe([])).toBe(null);
  });

  it('averages standard sets with RPE', () => {
    expect(
      averageRpe([
        { perceivedEffort: 6, dropIndex: 0 },
        { perceivedEffort: 7, dropIndex: 0 },
        { perceivedEffort: 8, dropIndex: 0 },
      ])
    ).toBe(7);
  });

  it('skips drop sets', () => {
    expect(
      averageRpe([
        { perceivedEffort: 8, dropIndex: 0 },
        { perceivedEffort: 4, dropIndex: 1 },
        { perceivedEffort: 2, dropIndex: 2 },
      ])
    ).toBe(8);
  });

  it('skips sets without RPE', () => {
    expect(
      averageRpe([
        { perceivedEffort: 6, dropIndex: 0 },
        { perceivedEffort: null, dropIndex: 0 },
        { perceivedEffort: 8, dropIndex: 0 },
      ])
    ).toBe(7);
  });
});
