import { describe, expect, it } from 'vitest';
import type { Session, Set as WorkoutSet } from '../../../shared/api/types';
import { filterSessionsByExercise } from './tools';

let nextId = 1;

function set(exerciseName: string, catalogId: number | null): WorkoutSet {
  return {
    id: nextId++, sessionId: 1, exerciseId: null, exerciseName, weight: 50, reps: 10, setNumber: 1,
    perceivedEffort: null, dropIndex: 0, heartRateAvg: null, heartRateMax: null, durationSec: null,
    distance: null, catalogId, createdAt: '', updatedAt: '',
  };
}

function session(sets: WorkoutSet[]): Session {
  return {
    id: nextId++, programId: 1, programName: 'P', workoutId: 1, workoutName: 'A',
    completedAt: '2026-09-07T11:00:00.000Z', isAdHoc: false, heartRateAvg: null, heartRateMin: null,
    heartRateMax: null, heartRateSeries: null, exerciseNotes: null, createdAt: '', updatedAt: '', sets,
  };
}

const CATALOG = [
  { id: 10, name: 'Low Incline Dumbbell Press', aliases: ['Low Incline DB Press'] },
  { id: 11, name: 'Squat', aliases: [] },
];

const SESSIONS = [
  session([set('Low Incline DB Press', 10), set('Squat', 11)]),
  session([set('Low Incline Dumbbell Press', 10)]),
  session([set('Squat', 11)]),
];

describe('filterSessionsByExercise', () => {
  it('matches a merged lift under its catalog name, returning both spellings', () => {
    const out = filterSessionsByExercise(SESSIONS, 'Low Incline Dumbbell Press', CATALOG);
    expect(out.sessions).toHaveLength(2);
    expect(out.sessions[0].sets?.map((s) => s.exerciseName)).toEqual(['Low Incline DB Press']);
    expect(out.matchedNames).toEqual(['Low Incline DB Press', 'Low Incline Dumbbell Press']);
  });

  it('matches through an alias too', () => {
    const out = filterSessionsByExercise(SESSIONS, 'incline db', CATALOG);
    expect(out.matchedNames).toEqual(['Low Incline DB Press', 'Low Incline Dumbbell Press']);
  });

  it('falls back to substring matching without a catalog', () => {
    const out = filterSessionsByExercise(SESSIONS, 'incline', undefined);
    expect(out.sessions).toHaveLength(2);
    expect(filterSessionsByExercise(SESSIONS, 'Low Incline Dumbbell Press').sessions).toHaveLength(1);
  });

  it('returns nothing for an unknown lift', () => {
    expect(filterSessionsByExercise(SESSIONS, 'Deadlift', CATALOG)).toEqual({ sessions: [], matchedNames: [] });
  });
});
