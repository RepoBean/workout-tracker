import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb } from './app.js';
import { Program, Workout } from '../src/models/index.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDb();
});

async function seedWorkout() {
  const program = await Program.create({ name: 'Test Program' });
  return Workout.create({ programId: program.id, name: 'Day A', orderIndex: 0 });
}

describe('POST /api/exercises', () => {
  it('rejects cardio exercises without a duration or distance target', async () => {
    const workout = await seedWorkout();

    const res = await request(app).post('/api/exercises').send({
      workoutId: workout.id,
      name: 'Run',
      targetSets: 1,
      targetReps: '1',
      orderIndex: 0,
      exerciseType: 'cardio',
    });

    expect(res.status).toBe(400);
  });

  it('creates a cardio exercise with a duration target', async () => {
    const workout = await seedWorkout();

    const res = await request(app).post('/api/exercises').send({
      workoutId: workout.id,
      name: 'Run',
      targetSets: 1,
      targetReps: '1',
      orderIndex: 0,
      exerciseType: 'cardio',
      cardioModality: 'running',
      targetDurationSec: 1800,
    });

    expect(res.status).toBe(201);
    expect(res.body.exerciseType).toBe('cardio');
    expect(res.body.targetDurationSec).toBe(1800);
  });

  it('defaults exerciseType to strength when omitted', async () => {
    const workout = await seedWorkout();

    const res = await request(app).post('/api/exercises').send({
      workoutId: workout.id,
      name: 'Curl',
      targetSets: 3,
      targetReps: '10-12',
      orderIndex: 0,
    });

    expect(res.status).toBe(201);
    expect(res.body.exerciseType).toBe('strength');
  });
});

describe('param validation', () => {
  it('returns 400 for non-numeric exercise ids', async () => {
    const res = await request(app).get('/api/exercises/12.5');
    expect(res.status).toBe(400);
  });
});
