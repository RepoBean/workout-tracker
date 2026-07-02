import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb } from './app.js';
import { Program } from '../src/models/index.js';
import type { ProgramWithWorkoutsAndExercises } from '../src/types/associations.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDb();
});

describe('POST /api/programs/import', () => {
  it('imports a program with no workouts key (schema default applies)', async () => {
    const res = await request(app)
      .post('/api/programs/import')
      .send({ version: 1, program: { name: 'Bare Program' } });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Bare Program');
    expect(res.body.workouts).toEqual([]);
  });

  it('imports a workout with no exercises key (schema default applies)', async () => {
    const res = await request(app)
      .post('/api/programs/import')
      .send({
        version: 1,
        program: {
          name: 'One Workout',
          workouts: [{ name: 'Day A', orderIndex: 0 }],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.workouts).toHaveLength(1);
    expect(res.body.workouts[0].exercises).toEqual([]);
  });

  it('imports cardio exercises with all fields intact', async () => {
    const res = await request(app)
      .post('/api/programs/import')
      .send({
        version: 1,
        program: {
          name: 'Cardio Program',
          workouts: [{
            name: 'Day A',
            orderIndex: 0,
            exercises: [{
              name: 'Row',
              targetSets: 1,
              targetReps: '1',
              orderIndex: 0,
              exerciseType: 'cardio',
              cardioModality: 'rowing',
              targetDurationSec: 1200,
            }],
          }],
        },
      });

    expect(res.status).toBe(201);
    const exercise = res.body.workouts[0].exercises[0];
    expect(exercise.exerciseType).toBe('cardio');
    expect(exercise.cardioModality).toBe('rowing');
    expect(exercise.targetDurationSec).toBe(1200);
  });

  it('rejects an unknown version', async () => {
    const res = await request(app)
      .post('/api/programs/import')
      .send({ version: 2, program: { name: 'Future Format' } });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/programs/:id', () => {
  it('rejects a body containing only isActive', async () => {
    const program = await Program.create({ name: 'Test' });

    const res = await request(app)
      .put(`/api/programs/${program.id}`)
      .send({ isActive: true });

    expect(res.status).toBe(400);
    await program.reload();
    expect(program.isActive).toBe(false);
  });

  it('strips isActive when sent alongside valid fields', async () => {
    const program = await Program.create({ name: 'Test' });

    const res = await request(app)
      .put(`/api/programs/${program.id}`)
      .send({ name: 'Renamed', isActive: true });

    expect(res.status).toBe(200);
    await program.reload();
    expect(program.name).toBe('Renamed');
    expect(program.isActive).toBe(false);
  });
});

describe('PUT /api/programs/:id/set-active', () => {
  it('keeps exactly one program active and unarchives the target', async () => {
    const a = await Program.create({ name: 'A', isActive: true });
    const b = await Program.create({ name: 'B', isArchived: true });

    const res = await request(app).put(`/api/programs/${b.id}/set-active`);

    expect(res.status).toBe(200);
    await a.reload();
    await b.reload();
    expect(a.isActive).toBe(false);
    expect(b.isActive).toBe(true);
    expect(b.isArchived).toBe(false);
  });

  it('returns 404 and rolls back when the program does not exist', async () => {
    const a = await Program.create({ name: 'A', isActive: true });

    const res = await request(app).put('/api/programs/9999/set-active');

    expect(res.status).toBe(404);
    await a.reload();
    expect(a.isActive).toBe(true);
  });
});

describe('param validation', () => {
  it('returns 400 (not 500) for non-numeric ids', async () => {
    const res = await request(app).get('/api/programs/abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid URL parameters');
  });

  it('still returns 404 for well-formed missing ids', async () => {
    const res = await request(app).get('/api/programs/9999');
    expect(res.status).toBe(404);
  });
});

describe('duplicate + export round trip', () => {
  it('duplicates a program preserving cardio exercise fields', async () => {
    const imported = await request(app)
      .post('/api/programs/import')
      .send({
        version: 1,
        program: {
          name: 'Original',
          workouts: [{
            name: 'Day A',
            orderIndex: 0,
            exercises: [
              { name: 'Squat', targetSets: 3, targetReps: '5', orderIndex: 0, supersetGroup: 'A' },
              {
                name: 'Bike', targetSets: 1, targetReps: '1', orderIndex: 1,
                exerciseType: 'cardio', cardioModality: 'cycling', targetDistance: 5,
              },
            ],
          }],
        },
      });
    expect(imported.status).toBe(201);

    const res = await request(app).post(`/api/programs/${imported.body.id}/duplicate`);
    expect(res.status).toBe(201);

    const copy = res.body as ProgramWithWorkoutsAndExercises;
    expect(copy.name).toBe('Original (Copy)');
    const [squat, bike] = copy.workouts[0].exercises;
    expect(squat.supersetGroup).toBe('A');
    expect(bike.exerciseType).toBe('cardio');
    expect(bike.cardioModality).toBe('cycling');
    expect(Number(bike.targetDistance)).toBe(5);
  });
});
