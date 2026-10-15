import { describe, it, expect } from 'vitest';
import { localDateKey } from './localDate';

describe('localDateKey', () => {
  it('uses the local calendar day for a late-evening timestamp', () => {
    const lateEvening = new Date(2026, 9, 10, 23, 30);
    expect(localDateKey(lateEvening)).toBe('2026-10-10');
    // Same instant as the ISO string the API sends.
    expect(localDateKey(lateEvening.toISOString())).toBe('2026-10-10');
  });
});
