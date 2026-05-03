import { describe, expect, it } from 'vitest';
import { formatMMSS } from './format';

describe('formatMMSS', () => {
  it('formats zero seconds', () => {
    expect(formatMMSS(0)).toBe('0:00');
  });

  it('zero-pads single-digit seconds', () => {
    expect(formatMMSS(59)).toBe('0:59');
  });

  it('rolls over to one minute', () => {
    expect(formatMMSS(60)).toBe('1:00');
  });

  it('formats mid-minute durations', () => {
    expect(formatMMSS(90)).toBe('1:30');
  });

  it('formats double-digit minutes with zero-padded seconds', () => {
    expect(formatMMSS(605)).toBe('10:05');
  });
});
