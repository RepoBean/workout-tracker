// Time axis + range selection for the Progress detail charts. Pure; `now` is passed in.
// Sessions sit on a real time axis so a three-month gap looks like one.

export type ChartRange = '3m' | '6m' | '1y' | 'all';

export const CHART_RANGES: ReadonlyArray<{ value: ChartRange; label: string }> = [
    { value: '3m', label: '3M' },
    { value: '6m', label: '6M' },
    { value: '1y', label: '1Y' },
    { value: 'all', label: 'All' },
];

const MONTHS: Record<Exclude<ChartRange, 'all'>, number> = { '3m': 3, '6m': 6, '1y': 12 };
const DAY_MS = 24 * 60 * 60 * 1000;
/** At most this many x-axis labels — fits a phone-width chart with year suffixes. */
const MAX_TICKS = 5;

/** Start of the window (ms), or null for All. Calendar months back from `now`. */
export function rangeStart(range: ChartRange, now: Date): number | null {
    if (range === 'all') return null;
    const d = new Date(now);
    d.setMonth(d.getMonth() - MONTHS[range]);
    return d.getTime();
}

export function inRange<T extends { date: string }>(items: T[], range: ChartRange, now: Date): T[] {
    const start = rangeStart(range, now);
    return start == null ? items : items.filter((i) => Date.parse(i.date) >= start);
}

/** 6M, unless the lift has fewer than 2 sessions in it — then All. */
export function defaultRange(items: Array<{ date: string }>, now: Date): ChartRange {
    return inRange(items, '6m', now).length >= 2 ? '6m' : 'all';
}

export interface TimeAxis {
    domain: [number, number];
    ticks: number[];
    format: (ms: number) => string;
}

function dayTicks(lo: number, hi: number, step: number, sundays: boolean): number[] {
    const d = new Date(lo);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < lo) d.setDate(d.getDate() + 1);
    if (sundays) while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
    const out: number[] = [];
    for (; d.getTime() <= hi; d.setDate(d.getDate() + step)) out.push(d.getTime());
    return out;
}

function monthTicks(lo: number, hi: number, step: number): number[] {
    const d = new Date(lo);
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    if (d.getTime() < lo) d.setMonth(d.getMonth() + 1);
    while (d.getMonth() % step !== 0) d.setMonth(d.getMonth() + 1);
    const out: number[] = [];
    for (; d.getTime() <= hi; d.setMonth(d.getMonth() + step)) out.push(d.getTime());
    return out;
}

/**
 * Domain padded a little past the data, ticks on day / Sunday / month-start boundaries
 * (the finest step that gives ≤ MAX_TICKS), labelled M/D — with /YY when the visible span
 * crosses a year boundary.
 */
export function timeAxis(times: number[]): TimeAxis {
    const min = Math.min(...times);
    const max = Math.max(...times);
    const pad = max === min ? 3 * DAY_MS : Math.max((max - min) * 0.03, DAY_MS / 2);
    const lo = min - pad;
    const hi = max + pad;

    const candidates: Array<() => number[]> = [
        () => dayTicks(lo, hi, 1, false),
        () => dayTicks(lo, hi, 2, false),
        () => dayTicks(lo, hi, 7, true),
        () => dayTicks(lo, hi, 14, true),
        ...[1, 2, 3, 6, 12].map((step) => () => monthTicks(lo, hi, step)),
    ];
    let ticks: number[] = [];
    for (const make of candidates) {
        ticks = make();
        if (ticks.length <= MAX_TICKS) break;
    }

    const crossesYear = new Date(lo).getFullYear() !== new Date(hi).getFullYear();
    const format = (ms: number) => {
        const d = new Date(ms);
        const md = `${d.getMonth() + 1}/${d.getDate()}`;
        return crossesYear ? `${md}/${String(d.getFullYear()).slice(-2)}` : md;
    };
    return { domain: [lo, hi], ticks, format };
}
