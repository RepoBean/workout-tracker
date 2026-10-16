import { describe, expect, it } from 'vitest';
import type { Exercise, Program } from '../../../shared/api/types';
import { describePlan, planProgramEdit, stepCount } from './programEdit';
import { normalizeProgramEdit } from './tools';

function ex(id: number, name: string, over: Partial<Exercise> = {}): Exercise {
  return {
    id, workoutId: 1, name, targetSets: 3, targetReps: '10-15', orderIndex: id, supersetGroup: null,
    exerciseType: 'strength', cardioModality: null, targetDurationSec: null, targetDistance: null,
    catalogId: null, incrementLbs: null, createdAt: '', updatedAt: '', ...over,
  };
}

const program = (): Program => ({
  id: 7, name: 'Full Body 3.0', isActive: true, isArchived: false, currentWorkoutIndex: 0, createdAt: '', updatedAt: '',
  workouts: [
    {
      id: 1, programId: 7, name: 'Full Body A', orderIndex: 0, createdAt: '', updatedAt: '',
      exercises: [
        ex(1, 'Squat', { targetReps: '5-8', orderIndex: 0 }),
        ex(2, 'Lateral Raise', { orderIndex: 1 }),
        ex(3, 'Pallof Press', { orderIndex: 2 }),
        ex(4, 'Treadmill', { orderIndex: 3, exerciseType: 'cardio', cardioModality: 'treadmill', targetDurationSec: 600 }),
      ],
    },
    { id: 2, programId: 7, name: 'Full Body B', orderIndex: 1, createdAt: '', updatedAt: '', exercises: [ex(5, 'Deadlift', { workoutId: 2 })] },
  ],
});

const same = (name: string, targetReps = '10-15', more: object = {}) =>
  ({ name, targetSets: 3, targetReps, ...more });

function plan(input: Parameters<typeof planProgramEdit>[1], programs: Program[] = [program()]) {
  const r = planProgramEdit(programs, input);
  if ('error' in r) throw new Error(r.error);
  return r.plan;
}

describe('planProgramEdit', () => {
  it('updates ranges and steps, matching names case-insensitively', () => {
    const p = plan([{
      name: 'full body a',
      exercises: [same('squat', '5-8', { incrementLbs: 10 }), same('Lateral Raise', '8-12'), same('Pallof Press'), same('Treadmill', '1')],
    }]);
    expect(p.programId).toBe(7);
    expect(p.workouts).toHaveLength(1);
    const w = p.workouts[0];
    expect(w.workout?.id).toBe(1);
    expect(w.adds).toEqual([]);
    expect(w.removes).toEqual([]);
    expect(w.reordered).toBe(false);
    expect(w.updates.map((u) => [u.exercise.name, u.changes])).toEqual([
      ['Squat', ['+10 lb steps']],
      ['Lateral Raise', ['3 × 10-15 → 3 × 8-12']],
    ]);
    expect(w.updates[1].next.incrementLbs).toBeNull();
  });

  it('an omitted superset keeps the group; null clears it; a letter sets it', () => {
    const programs = [program()];
    programs[0].workouts![0].exercises![1].supersetGroup = 'A';
    const rest = [same('Pallof Press'), same('Treadmill')];
    const keep = plan([{ name: 'Full Body A', exercises: [same('Squat', '5-8'), same('Lateral Raise', '8-12'), ...rest] }], programs);
    expect(keep.workouts[0].updates[0].changes).toEqual(['3 × 10-15 → 3 × 8-12']);
    expect(keep.workouts[0].updates[0].next.supersetGroup).toBe('A');

    const clear = plan([{ name: 'Full Body A', exercises: [same('Squat', '5-8'), same('Lateral Raise', '10-15', { supersetGroup: null }), ...rest] }], programs);
    expect(clear.workouts[0].updates[0].changes).toEqual(['no superset']);

    const set = plan([{ name: 'Full Body A', exercises: [same('Squat', '5-8', { supersetGroup: 'B' }), same('Lateral Raise'), ...rest] }], programs);
    expect(set.workouts[0].updates[0].changes).toEqual(['superset B']);
  });

  it('an omitted step keeps the current one; null clears it', () => {
    const programs = [program()];
    programs[0].workouts![0].exercises![0].incrementLbs = 10;
    const keep = plan([{ name: 'Full Body A', exercises: [same('Squat', '6-8'), same('Lateral Raise'), same('Pallof Press'), same('Treadmill')] }], programs);
    expect(keep.workouts[0].updates[0].next.incrementLbs).toBe(10);
    expect(keep.workouts[0].updates[0].changes).toEqual(['3 × 5-8 → 3 × 6-8']);

    const clear = plan([{ name: 'Full Body A', exercises: [same('Squat', '5-8', { incrementLbs: null }), same('Lateral Raise'), same('Pallof Press'), same('Treadmill')] }], programs);
    expect(clear.workouts[0].updates[0].changes).toEqual(['default step']);
  });

  it('adds, removes and reorders; cardio is kept as is', () => {
    const p = plan([{
      name: 'Full Body A',
      exercises: [same('Squat', '5-8'), same('Face Pull', '12-15'), same('Treadmill', '1'), same('Lateral Raise')],
    }]);
    const w = p.workouts[0];
    expect(w.adds.map((a) => a.name)).toEqual(['Face Pull']);
    expect(w.removes.map((r) => r.name)).toEqual(['Pallof Press']);
    expect(w.updates).toEqual([]); // the treadmill's "1" reps are ignored
    expect(w.order).toEqual([{ id: 1 }, { add: 0 }, { id: 4 }, { id: 2 }]);
    expect(w.reordered).toBe(true);
    expect(stepCount(p)).toBe(3); // remove, add, reorder
  });

  it('an add at the end needs no reorder', () => {
    const p = plan([{ name: 'Full Body B', exercises: [same('Deadlift'), same('Back Extension', '10-12')] }]);
    expect(p.workouts[0].reordered).toBe(false);
    expect(stepCount(p)).toBe(1);
  });

  it('an unknown workout name is a new workout; unlisted workouts are untouched', () => {
    const p = plan([{ name: 'Full Body C', exercises: [same('RDL', '8-10')] }]);
    expect(p.workouts).toHaveLength(1);
    expect(p.workouts[0].workout).toBeNull();
    expect(p.workouts[0].adds.map((a) => a.name)).toEqual(['RDL']);
    expect(stepCount(p)).toBe(2); // create workout + add
    expect(describePlan(p)).toContain('Full Body C (new workout)');
  });

  it('rejects no active program, an emptied workout and a no-op', () => {
    const inactive = { ...program(), isActive: false };
    expect(planProgramEdit([inactive], [{ name: 'A', exercises: [same('X')] }])).toHaveProperty('error');
    expect(planProgramEdit([program()], [{ name: 'Full Body B', exercises: [] }])).toHaveProperty('error');
    expect(planProgramEdit([program()], [{ name: 'Full Body B', exercises: [same('Deadlift')] }])).toHaveProperty('error');
    expect(planProgramEdit([program()], [])).toHaveProperty('error');
  });

  it('matches duplicate names in order', () => {
    const programs = [program()];
    programs[0].workouts![1].exercises = [ex(5, 'Hip Abduction', { orderIndex: 0 }), ex(6, 'Hip Abduction', { orderIndex: 1, targetReps: '12-15' })];
    const p = plan([{ name: 'Full Body B', exercises: [same('Hip Abduction'), same('Hip Abduction', '15-20')] }], programs);
    expect(p.workouts[0].updates.map((u) => [u.exercise.id, u.changes])).toEqual([[6, ['3 × 12-15 → 3 × 15-20']]]);
  });
});

describe('normalizeProgramEdit', () => {
  it('cleans the model input', () => {
    expect(normalizeProgramEdit({
      workouts: [{
        name: ' Full Body A ',
        exercises: [
          { name: 'Squat', targetSets: 3.2, targetReps: '5-8', supersetGroup: 'a', incrementLbs: 10 },
          { name: 'Curl', targetSets: 3, targetReps: 12, incrementLbs: 500 },
          { name: 'Row', targetSets: 3, targetReps: '8', supersetGroup: 'none' },
          { name: 'Fly', targetSets: 3, targetReps: '8', supersetGroup: 'Z' },
          { name: '', targetSets: 3, targetReps: '8' },
          'junk',
        ],
      }],
    })).toEqual([{
      name: 'Full Body A',
      exercises: [
        { name: 'Squat', targetSets: 3, targetReps: '5-8', supersetGroup: 'A', incrementLbs: 10 },
        { name: 'Curl', targetSets: 3, targetReps: '12' },
        { name: 'Row', targetSets: 3, targetReps: '8', supersetGroup: null },
        { name: 'Fly', targetSets: 3, targetReps: '8' },
      ],
    }]);
  });

  it('keeps an explicit null step and rejects a missing workouts list or name', () => {
    expect(normalizeProgramEdit({ workouts: [{ name: 'A', exercises: [{ name: 'X', targetSets: 3, targetReps: '8', incrementLbs: null }] }] })?.[0].exercises[0])
      .toHaveProperty('incrementLbs', null);
    expect(normalizeProgramEdit({})).toBeNull();
    expect(normalizeProgramEdit({ workouts: [{ exercises: [] }] })).toBeNull();
  });
});
