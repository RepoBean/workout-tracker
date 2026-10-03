import { describe, expect, it } from 'vitest';
import { defaultRange, inRange, rangeStart, timeAxis } from './chartRange';

const NOW = new Date(2026, 9, 3, 12); // Oct 3 2026, local
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 11).toISOString();

describe('ranges', () => {
    const items = [at(2025, 12, 10), at(2026, 3, 1), at(2026, 5, 1), at(2026, 8, 1), at(2026, 10, 2)].map((date) => ({ date }));

    it('filters by calendar months back from now', () => {
        expect(rangeStart('all', NOW)).toBeNull();
        expect(new Date(rangeStart('3m', NOW) as number).getMonth()).toBe(6);
        expect(inRange(items, '3m', NOW)).toHaveLength(2);
        expect(inRange(items, '6m', NOW)).toHaveLength(3);
        expect(inRange(items, '1y', NOW)).toHaveLength(5);
        expect(inRange(items, 'all', NOW)).toBe(items);
    });

    it('defaults to 6M, or All when 6M holds fewer than 2 sessions', () => {
        expect(defaultRange(items, NOW)).toBe('6m');
        expect(defaultRange([{ date: at(2026, 1, 5) }, { date: at(2026, 9, 1) }], NOW)).toBe('all');
        expect(defaultRange([], NOW)).toBe('all');
    });
});

describe('timeAxis', () => {
    it('spaces by time and keeps the domain around the data', () => {
        const t = [new Date(2026, 3, 1).getTime(), new Date(2026, 8, 1).getTime()];
        const axis = timeAxis(t);
        expect(axis.domain[0]).toBeLessThan(t[0]);
        expect(axis.domain[1]).toBeGreaterThan(t[1]);
        expect(axis.ticks.length).toBeLessThanOrEqual(5);
        expect(axis.ticks.length).toBeGreaterThanOrEqual(2);
        // Month-start ticks, M/D labels, no year inside one year.
        expect(axis.ticks.every((ms) => new Date(ms).getDate() === 1)).toBe(true);
        expect(axis.format(new Date(2026, 4, 1).getTime())).toBe('5/1');
    });

    it('adds the year when the span crosses a year boundary', () => {
        const axis = timeAxis([new Date(2025, 11, 10).getTime(), new Date(2026, 9, 2).getTime()]);
        expect(axis.format(new Date(2026, 0, 1).getTime())).toBe('1/1/26');
        expect(axis.ticks.length).toBeLessThanOrEqual(5);
    });

    it('uses day or week ticks for short spans and pads a single point', () => {
        const short = timeAxis([new Date(2026, 8, 1).getTime(), new Date(2026, 8, 4).getTime()]);
        expect(short.ticks.length).toBeGreaterThanOrEqual(2);
        expect(short.ticks.length).toBeLessThanOrEqual(5);
        const one = timeAxis([new Date(2026, 8, 1, 11).getTime()]);
        expect(one.domain[1] - one.domain[0]).toBe(6 * 24 * 60 * 60 * 1000);
        expect(one.ticks.length).toBeGreaterThan(0);
    });
});
