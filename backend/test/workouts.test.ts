import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb } from './app.js';
import { Program, Workout, Exercise } from '../src/models/index.js';
import type { WorkoutWithExercises } from '../src/types/associations.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDb();
});

async function seedWorkout() {
  const program = await Program.create({ name: 'Test Program' });
  const workout = await Workout.create({ programId: program.id, name: 'Day A', orderIndex: 0 });
  await Exercise.create({
    workoutId: workout.id,
    name: 'Bench Press',
    targetSets: 3,
    targetReps: '8-10',
    orderIndex: 0,
    supersetGroup: 'A',
  });
  await Exercise.create({
    workoutId: workout.id,
    name: 'Rowing',
    targetSets: 1,
    targetReps: '1',
    orderIndex: 1,
    exerciseType: 'cardio',
    cardioModality: 'rowing',
    targetDurationSec: 1200,
    targetDistance: 2.5,
  });
  return { program, workout };
}

describe('POST /api/workouts/:id/duplicate', () => {
  it('preserves cardio fields and supersetGroup on copied exercises', async () => {
    const { workout } = await seedWorkout();

    const res = await request(app).post(`/api/workouts/${workout.id}/duplicate`);
    expect(res.status).toBe(201);

    const copy = res.body as WorkoutWithExercises;
    expect(copy.name).toBe('Day A (Copy)');
    expect(copy.orderIndex).toBe(1);
    expect(copy.exercises).toHaveLength(2);

    const [bench, row] = copy.exercises;
    expect(bench.name).toBe('Bench Press');
    expect(bench.supersetGroup).toBe('A');
    expect(bench.exerciseType).toBe('strength');

    expect(row.name).toBe('Rowing');
    expect(row.exerciseType).toBe('cardio');
    expect(row.cardioModality).toBe('rowing');
    expect(row.targetDurationSec).toBe(1200);
    expect(Number(row.targetDistance)).toBe(2.5);
  });

  it('returns 404 for a missing workout', async () => {
    const res = await request(app).post('/api/workouts/9999/duplicate');
    expect(res.status).toBe(404);
  });
});

describe('param validation', () => {
  it('returns 400 for non-numeric workout ids', async () => {
    const res = await request(app).get('/api/workouts/abc');
    expect(res.status).toBe(400);
  });
});
