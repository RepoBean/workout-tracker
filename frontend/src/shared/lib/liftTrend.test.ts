import { describe, expect, it } from 'vitest';
import { addToDayTop, daysBetween, liftStatus, localToday, stallRun, type DayTop } from './liftTrend';

/** Build a topByDate map from [date, weight, ...reps per set] rows. */
function history(rows: Array<[string, number, ...number[]]>): Map<string, DayTop> {
  const out = new Map<string, DayTop>();
  for (const [date, weight, ...reps] of rows) {
    for (const r of reps) out.set(date, addToDayTop(out.get(date), weight, r));
  }
  return out;
}

/** n consecutive dates from 2026-09-01 with the same weight/reps. */
function flat(n: number, weight: number, reps: number): Array<[string, number, number]> {
  return Array.from({ length: n }, (_, i) => [`2026-09-${String(i + 1).padStart(2, '0')}`, weight, reps]);
}

const TODAY = '2026-09-20';

describe('addToDayTop', () => {
  it('keeps the heaviest weight and the reps at exactly it', () => {
    let day = addToDayTop(undefined, 100, 8);
    day = addToDayTop(day, 80, 15);
    day = addToDayTop(day, 100, 6);
    expect(day).toEqual({ weight: 100, bestReps: 8, totalReps: 14 });
    expect(addToDayTop(day, 105, 3)).toEqual({ weight: 105, bestReps: 3, totalReps: 3 });
  });
});

describe('stallRun', () => {
  it('is empty without history or at weight 0', () => {
    expect(stallRun(new Map())).toEqual({ sessions: 0, weight: 0 });
    expect(stallRun(history(flat(4, 0, 10)))).toEqual({ sessions: 0, weight: 0 });
  });

  it('counts an unchanged top weight from the baseline', () => {
    expect(stallRun(history(flat(3, 140, 10)))).toEqual({ sessions: 3, weight: 140 });
  });

  it('counts from the last improving session', () => {
    const rows = [8, 9, 10, 10, 9, 10].map((r, i): [string, number, number] => [`2026-09-0${i + 1}`, 100, r]);
    expect(stallRun(history(rows)).sessions).toBe(4);
  });

  it('treats more total reps at the weight as progress', () => {
    const h = history([
      ['2026-09-01', 100, 10, 10],
      ['2026-09-02', 100, 10, 10],
      ['2026-09-03', 100, 10, 10, 10],
    ]);
    expect(stallRun(h).sessions).toBe(1);
  });
});

describe('liftStatus', () => {
  it('none without history', () => {
    expect(liftStatus(new Map(), TODAY)).toEqual({ kind: 'none' });
  });

  it('inactive at 42+ idle days, before anything else', () => {
    const h = history(flat(5, 100, 8));
    expect(liftStatus(h, '2026-10-17')).toEqual({ kind: 'inactive', lastDate: '2026-09-05' });
    expect(liftStatus(h, '2026-10-16').kind).toBe('stalled');
  });

  it('new under 3 dates', () => {
    expect(liftStatus(history(flat(2, 100, 8)), TODAY)).toEqual({ kind: 'new' });
  });

  it('stalled at 3+ sessions, carrying the count and weight', () => {
    expect(liftStatus(history(flat(4, 100, 8)), TODAY)).toEqual({ kind: 'stalled', sessions: 4, weight: 100 });
  });

  it('lighter when the latest date dropped to a lower top weight', () => {
    const h = history([
      ['2026-09-01', 100, 8],
      ['2026-09-02', 105, 8],
      ['2026-09-03', 95, 10],
    ]);
    expect(liftStatus(h, TODAY)).toEqual({ kind: 'lighter' });
  });

  it('stalled wins over lighter (a long run that ends lower is still a run)', () => {
    // Lower weight held for 3 sessions: the run is at 95 and reads as a stall.
    const h = history([
      ['2026-09-01', 105, 8],
      ['2026-09-02', 95, 8],
      ['2026-09-03', 95, 8],
      ['2026-09-04', 95, 8],
    ]);
    expect(liftStatus(h, TODAY).kind).toBe('stalled');
  });

  it('progressing when the latest session added weight or reps', () => {
    expect(liftStatus(history([['2026-09-01', 100, 8], ['2026-09-02', 100, 8], ['2026-09-03', 105, 6]]), TODAY))
      .toEqual({ kind: 'progressing' });
    expect(liftStatus(history([['2026-09-01', 100, 8], ['2026-09-02', 100, 8], ['2026-09-03', 100, 9]]), TODAY))
      .toEqual({ kind: 'progressing' });
  });

  it('holding one session after the last improvement', () => {
    const h = history([['2026-09-01', 100, 8], ['2026-09-02', 100, 9], ['2026-09-03', 100, 9]]);
    expect(liftStatus(h, TODAY)).toEqual({ kind: 'holding' });
  });
});

describe('date helpers', () => {
  it('daysBetween counts whole days and tolerates junk', () => {
    expect(daysBetween('2026-09-01', '2026-10-13')).toBe(42);
    expect(daysBetween('unknown', '2026-10-13')).toBe(0);
  });

  it('localToday is the local calendar date', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
