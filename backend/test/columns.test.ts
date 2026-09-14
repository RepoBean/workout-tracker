import { describe, it, expect } from 'vitest';
import { fromStorage, toStorage } from '../src/db/columns.js';

// The storage format is Sequelize's, verified against live rows on 2026-09-13.
const LIVE_SAMPLE = '2026-09-11 16:10:29.104 +00:00';

describe('sequelizeDate storage format', () => {
  it('reads a live Sequelize-written value', () => {
    expect(fromStorage(LIVE_SAMPLE).toISOString()).toBe('2026-09-11T16:10:29.104Z');
  });

  it('writes exactly the Sequelize format', () => {
    expect(toStorage(new Date('2026-09-11T16:10:29.104Z'))).toBe(LIVE_SAMPLE);
  });

  it('round-trips with millisecond precision', () => {
    const d = new Date('2026-01-29T16:42:55.246Z');
    expect(fromStorage(toStorage(d)).getTime()).toBe(d.getTime());
  });

  it('sorts lexicographically in time order (query bounds rely on this)', () => {
    const a = toStorage(new Date('2026-09-07T23:59:59.999Z'));
    const b = toStorage(new Date('2026-09-08T00:00:00.000Z'));
    expect(a < b).toBe(true);
  });

  it('tolerates ISO input and rejects garbage', () => {
    expect(fromStorage('2026-09-11T16:10:29.104Z').getTime()).toBe(Date.UTC(2026, 8, 11, 16, 10, 29, 104));
    expect(() => fromStorage('garbage')).toThrow();
    expect(() => toStorage(new Date('garbage'))).toThrow();
  });
});
