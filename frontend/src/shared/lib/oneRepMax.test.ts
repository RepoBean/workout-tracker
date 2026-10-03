import { describe, expect, it } from 'vitest';
import { epleyOneRepMax } from './oneRepMax';

describe('epleyOneRepMax', () => {
  it('applies Epley above one rep, rounded', () => {
    expect(epleyOneRepMax(200, 10)).toBe(267);
    expect(epleyOneRepMax(225, 5)).toBe(263);
  });

  it('treats a single as its own 1RM', () => {
    expect(epleyOneRepMax(315, 1)).toBe(315);
    expect(epleyOneRepMax(102.5, 1)).toBe(102.5);
  });
});
