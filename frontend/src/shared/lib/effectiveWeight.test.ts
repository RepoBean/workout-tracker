import { describe, it, expect } from 'vitest';
import { effectiveWeight, isAssisted, setVolume } from './effectiveWeight';

describe('effectiveWeight', () => {
  it('passes non-negative weights through unchanged', () => {
    expect(effectiveWeight(185, null)).toBe(185);
    expect(effectiveWeight(185, 200)).toBe(185);
    expect(effectiveWeight(0, 200)).toBe(0);
  });

  it('subtracts assistance from bodyweight', () => {
    expect(effectiveWeight(-40, 185)).toBe(145);
  });

  it('returns null for an assisted set without a bodyweight', () => {
    expect(effectiveWeight(-40, null)).toBeNull();
  });

  it('clamps at zero when assistance exceeds bodyweight', () => {
    expect(effectiveWeight(-250, 185)).toBe(0);
  });
});

describe('isAssisted', () => {
  it('is true only for negative weights', () => {
    expect(isAssisted(-2.5)).toBe(true);
    expect(isAssisted(0)).toBe(false);
    expect(isAssisted(45)).toBe(false);
  });
});

describe('setVolume', () => {
  it('uses effective load for assisted sets and 0 when not computable', () => {
    expect(setVolume({ weight: 100, reps: 10 }, null)).toBe(1000);
    expect(setVolume({ weight: -40, reps: 8 }, 185)).toBe(1160);
    expect(setVolume({ weight: -40, reps: 8 }, null)).toBe(0);
  });
});
