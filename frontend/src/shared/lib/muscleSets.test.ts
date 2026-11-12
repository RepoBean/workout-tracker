import { describe, expect, it } from 'vitest';
import type { CatalogEntry, Session, Set as WorkoutSet } from '../api/types';
import { catalogMuscles } from './muscles';
import { formatSetCount, muscleBand, muscleSummary, type MuscleRow } from './muscleSets';

let nextId = 1;

/** A local wall-clock time as the API's ISO string (TZ-independent fixtures). */
const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).toISOString();

function set(over: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: nextId++, sessionId: 1, exerciseId: 1, exerciseName: 'Leg Press', weight: 200, reps: 10,
    setNumber: 1, perceivedEffort: null, dropIndex: 0, heartRateAvg: null, heartRateMax: null,
    durationSec: null, distance: null, catalogId: 1, createdAt: '', updatedAt: '', ...over,
  };
}

function session(completedAt: string, sets: WorkoutSet[]): Session {
  return {
    id: nextId++, programId: 1, programName: 'P', workoutId: 1, workoutName: 'W', completedAt,
    isAdHoc: false, heartRateAvg: null, heartRateMin: null, heartRateMax: null, heartRateSeries: null,
    exerciseNotes: null, createdAt: completedAt, updatedAt: completedAt, sets,
  };
}

const entry = (id: number, muscles: CatalogEntry['muscles']): CatalogEntry => ({
  id, name: `Lift ${id}`, aliases: [], setCount: 0, exerciseCount: 0, createdAt: '', updatedAt: '', muscles,
});

// 1 Leg Press: quads, glutes / hamstrings · 2 Bench: chest / triceps, front-delts · 3 untagged
const CATALOG = catalogMuscles([
  entry(1, { primary: ['quads', 'glutes'], secondary: ['hamstrings'] }),
  entry(2, { primary: ['chest'], secondary: ['triceps', 'front-delts'] }),
  entry(3, null),
]);

// Thursday 2026-11-12: this week = Sun 11-08 → today; the 4 whole weeks = 10-11 … 11-07.
const TODAY = '2026-11-12';
const row = (rows: MuscleRow[], muscle: string) => rows.find((r) => r.muscle === muscle)!;

describe('muscleSummary', () => {
  it('counts 1 per primary, ½ per secondary, both primaries in full', () => {
    const { rows } = muscleSummary([session(at(2026, 11, 10), [set(), set(), set({ catalogId: 2 })])], CATALOG, TODAY);
    expect(row(rows, 'quads').thisWeek).toBe(2);
    expect(row(rows, 'glutes').thisWeek).toBe(2);
    expect(row(rows, 'hamstrings').thisWeek).toBe(1);
    expect(row(rows, 'chest').thisWeek).toBe(1);
    expect(row(rows, 'triceps').thisWeek).toBe(0.5);
  });

  it('skips drop sets, cardio and 0-rep sets; counts assisted and 0-weight sets', () => {
    const { rows } = muscleSummary([session(at(2026, 11, 10), [
      set({ dropIndex: 1 }),
      set({ reps: 0 }),
      set({ reps: 0, weight: 0, durationSec: 600 }),
      set({ weight: -40 }),
      set({ weight: 0 }),
    ])], CATALOG, TODAY);
    expect(row(rows, 'quads').thisWeek).toBe(2);
  });

  it('untagged and catalog-less sets go to untaggedSets over the 4 whole weeks only', () => {
    const s = muscleSummary([
      session(at(2026, 10, 20), [set({ catalogId: 3 }), set({ catalogId: null }), set(), set()]),
      session(at(2026, 11, 10), [set({ catalogId: 3 })]), // this week: not in the footer window
    ], CATALOG, TODAY);
    expect(s.untaggedSets).toBe(2);
    expect(s.totalSets).toBe(4);
  });

  it('averages the 4 whole weeks before this one; this week runs Sunday → today', () => {
    const s = muscleSummary([
      session(at(2026, 10, 10), [set(), set(), set(), set()]), // Sat before the window: out
      session(at(2026, 10, 11), [set(), set()]),               // Sun, first day of the window
      session(at(2026, 11, 7), [set(), set(), set(), set(), set(), set()]), // last day of the window
      session(at(2026, 11, 8), [set()]),                       // Sun: this week
    ], CATALOG, TODAY);
    expect(row(s.rows, 'quads').average).toBe(2);
    expect(row(s.rows, 'quads').thisWeek).toBe(1);
  });

  it('a Saturday 9 pm session stays in that week (local day)', () => {
    const s = muscleSummary([session(at(2026, 11, 7, 21), [set()])], CATALOG, TODAY);
    expect(row(s.rows, 'quads').thisWeek).toBe(0);
    expect(row(s.rows, 'quads').average).toBe(0.25);
    expect(row(s.rows, 'quads').lastTrained).toBe('2026-11-07');
  });

  it('flags at 14 days, not 13; never-trained muscles get no flag and no band', () => {
    const s = muscleSummary([
      session(at(2026, 10, 29), [set()]),            // 14 days before today
      session(at(2026, 10, 30), [set({ catalogId: 2 })]), // 13 days
    ], CATALOG, TODAY);
    expect(row(s.rows, 'quads')).toMatchObject({ daysSince: 14, flagged: true });
    expect(row(s.rows, 'chest')).toMatchObject({ daysSince: 13, flagged: false });
    expect(row(s.rows, 'calves')).toMatchObject({ lastTrained: null, daysSince: null, flagged: false, band: null });
    expect(row(s.rows, 'quads').band).toBe('low');
  });

  it('lists every muscle in vocabulary order; anyTags reflects the catalog', () => {
    const s = muscleSummary([], CATALOG, TODAY);
    expect(s.rows).toHaveLength(18);
    expect(s.rows[0].muscle).toBe('chest');
    expect(s.rows.at(-1)!.muscle).toBe('calves');
    expect(s.anyTags).toBe(true);
    expect(muscleSummary([], catalogMuscles([entry(1, null)]), TODAY).anyTags).toBe(false);
  });
});

describe('muscleBand', () => {
  it('low < 6 ≤ building < 10 ≤ solid ≤ 20 < high', () => {
    expect(muscleBand(5.5)).toBe('low');
    expect(muscleBand(6)).toBe('building');
    expect(muscleBand(9.5)).toBe('building');
    expect(muscleBand(10)).toBe('solid');
    expect(muscleBand(20)).toBe('solid');
    expect(muscleBand(20.5)).toBe('high');
  });
});

describe('catalogMuscles / formatSetCount', () => {
  it('ignores entries without muscles (older backend) and empty tags', () => {
    const map = catalogMuscles([
      { id: 1, name: 'A', aliases: [], setCount: 0, exerciseCount: 0, createdAt: '', updatedAt: '' },
      entry(2, { primary: [], secondary: [] }),
      entry(3, { primary: ['chest'], secondary: [] }),
    ]);
    expect([...map.keys()]).toEqual([3]);
    expect(catalogMuscles(undefined).size).toBe(0);
  });

  it('formats to one decimal', () => {
    expect([9.5, 6, 2.625, 0].map(formatSetCount)).toEqual(['9.5', '6', '2.6', '0']);
  });
});
