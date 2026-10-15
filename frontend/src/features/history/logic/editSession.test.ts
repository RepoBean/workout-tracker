import { describe, it, expect } from 'vitest';
import type { Exercise, Set } from '../../../shared/api/types';
import { groupSetsByExercise, localDateTime, nextSetNumber, toLocalInputs, unloggedSlots } from './editSession';

const set = (over: Partial<Set>): Set => ({
  id: 1, sessionId: 1, exerciseId: null, exerciseName: 'Bench', weight: 100, reps: 8, setNumber: 1,
  perceivedEffort: null, dropIndex: 0, heartRateAvg: null, heartRateMax: null, durationSec: null,
  distance: null, catalogId: null, createdAt: '', updatedAt: '', ...over,
});

describe('nextSetNumber', () => {
  it('is max + 1, not count + 1, after a mid-list delete', () => {
    expect(nextSetNumber([set({ setNumber: 1 }), set({ setNumber: 3 })])).toBe(4);
  });
  it('ignores drop sets and starts at 1', () => {
    expect(nextSetNumber([set({ setNumber: 2 }), set({ setNumber: 9, dropIndex: 1 })])).toBe(3);
    expect(nextSetNumber([])).toBe(1);
  });
});

describe('groupSetsByExercise', () => {
  it('groups in first-set order and flags cardio', () => {
    const groups = groupSetsByExercise([
      set({ id: 1, exerciseName: 'Row' }),
      set({ id: 2, exerciseName: 'Bench' }),
      set({ id: 3, exerciseName: 'Row' }),
      set({ id: 4, exerciseName: 'Treadmill', weight: 0, reps: 0, durationSec: 600 }),
    ]);
    expect(groups.map(g => [g.name, g.sets.length, g.cardio])).toEqual([
      ['Row', 2, false], ['Bench', 1, false], ['Treadmill', 1, true],
    ]);
  });
});

describe('unloggedSlots', () => {
  it('drops slots whose name was logged, case-insensitively', () => {
    const ex = (name: string) => ({ id: 1, name } as Exercise);
    expect(unloggedSlots([ex('Bench'), ex('Squat')], ['bench ']).map(e => e.name)).toEqual(['Squat']);
  });
});

describe('local date inputs', () => {
  it('builds the date in local time and round-trips', () => {
    const d = localDateTime('2026-10-10', '23:30');
    expect(d?.getHours()).toBe(23);
    expect(toLocalInputs(d!.toISOString())).toEqual({ date: '2026-10-10', time: '23:30' });
  });
  it('rejects malformed input', () => {
    expect(localDateTime('2026-10-10', '')).toBeNull();
  });
});
