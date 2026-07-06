import { describe, it, expect } from 'vitest';
import { encodeHrSamples, decodeHrSamples } from './heartRate';

const BASE = 1_750_000_000_000;

describe('encodeHrSamples / decodeHrSamples', () => {
  it('round-trips samples through the delta encoding', () => {
    const samples = [
      { ts: BASE, bpm: 92 },
      { ts: BASE + 1000, bpm: 95 },
      { ts: BASE + 2100, bpm: 101 },
    ];
    expect(decodeHrSamples(encodeHrSamples(samples, BASE))).toEqual(samples);
  });

  it('round-trips an empty array', () => {
    expect(decodeHrSamples(encodeHrSamples([], BASE))).toEqual([]);
  });

  it('returns null for null input', () => {
    expect(decodeHrSamples(null)).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(decodeHrSamples('not json')).toBeNull();
    expect(decodeHrSamples('[]')).toBeNull();
    expect(decodeHrSamples('{"v":2,"base":0,"s":[]}')).toBeNull();
    expect(decodeHrSamples('{"v":1,"s":[]}')).toBeNull();
    expect(decodeHrSamples('{"v":1,"base":"x","s":[]}')).toBeNull();
  });

  it('skips malformed entries but keeps valid ones', () => {
    const json = JSON.stringify({
      v: 1,
      base: BASE,
      s: [[0, 90], 'junk', [5], [null, 100], [1000, 93]],
    });
    expect(decodeHrSamples(json)).toEqual([
      { ts: BASE, bpm: 90 },
      { ts: BASE + 1000, bpm: 93 },
    ]);
  });
});
