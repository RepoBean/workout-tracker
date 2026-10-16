import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seed } from './app.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDb();
});

async function seedWorkout() {
  const program = seed.program({ name: 'Test Program' });
  return seed.workout({ programId: program.id, name: 'Day A', orderIndex: 0 });
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

describe('incrementLbs (per-exercise progression step)', () => {
  const base = { name: 'Squat', targetSets: 3, targetReps: '5-8', orderIndex: 0 };

  it('defaults to null and stores a value on create', async () => {
    const workout = await seedWorkout();
    const plain = await request(app).post('/api/exercises').send({ ...base, workoutId: workout.id });
    expect(plain.status).toBe(201);
    expect(plain.body.incrementLbs).toBeNull();

    const stepped = await request(app).post('/api/exercises').send({ ...base, workoutId: workout.id, incrementLbs: 10 });
    expect(stepped.status).toBe(201);
    expect(stepped.body.incrementLbs).toBe(10);
  });

  it('updates it alone, and clears it with null', async () => {
    const workout = await seedWorkout();
    const { body: ex } = await request(app).post('/api/exercises').send({ ...base, workoutId: workout.id });

    const set = await request(app).put(`/api/exercises/${ex.id}`).send({ incrementLbs: 2.5 });
    expect(set.status).toBe(200);
    expect(set.body.incrementLbs).toBe(2.5);
    expect(set.body.targetReps).toBe('5-8');

    const other = await request(app).put(`/api/exercises/${ex.id}`).send({ targetSets: 4 });
    expect(other.body.incrementLbs).toBe(2.5);

    const cleared = await request(app).put(`/api/exercises/${ex.id}`).send({ incrementLbs: null });
    expect(cleared.body.incrementLbs).toBeNull();
  });

  it('rejects zero, negative and over-100 steps', async () => {
    const workout = await seedWorkout();
    for (const incrementLbs of [0, -5, 101, 'ten']) {
      const res = await request(app).post('/api/exercises').send({ ...base, workoutId: workout.id, incrementLbs });
      expect(res.status).toBe(400);
    }
  });
});
