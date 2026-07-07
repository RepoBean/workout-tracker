import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb } from './app.js';
import { Program, Workout, Exercise, Session } from '../src/models/index.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDb();
});

async function seedProgram() {
  const program = await Program.create({ name: 'PPL', isActive: true });
  const push = await Workout.create({ programId: program.id, name: 'Push', orderIndex: 0 });
  const pull = await Workout.create({ programId: program.id, name: 'Pull', orderIndex: 1 });
  await Exercise.create({
    workoutId: push.id, name: 'Bench Press', targetSets: 3, targetReps: '8-10', orderIndex: 0,
  });
  return { program, push, pull };
}

async function startSession(workoutId: number, isAdHoc = false) {
  const res = await request(app).post('/api/sessions/start').send({ workoutId, isAdHoc });
  expect(res.status).toBe(201);
  return res.body as { id: number };
}

describe('POST /api/sessions/:id/sets', () => {
  it('logs a strength set and nulls negative ad-hoc exercise ids', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);

    const res = await request(app).post(`/api/sessions/${session.id}/sets`).send({
      exerciseId: -1751470000000,
      exerciseName: 'Cable Fly',
      weight: 40,
      reps: 12,
      setNumber: 1,
    });

    expect(res.status).toBe(201);
    expect(res.body.exerciseId).toBeNull();
    expect(res.body.exerciseName).toBe('Cable Fly');
  });

  it('rejects strength sets with zero reps', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);

    const res = await request(app).post(`/api/sessions/${session.id}/sets`).send({
      exerciseName: 'Bench Press',
      weight: 185,
      reps: 0,
      setNumber: 1,
    });

    expect(res.status).toBe(400);
  });

  it('accepts cardio sets with zero reps', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);

    const res = await request(app).post(`/api/sessions/${session.id}/sets`).send({
      exerciseName: 'Rowing',
      weight: 0,
      reps: 0,
      setNumber: 1,
      durationSec: 900,
      distance: 2,
    });

    expect(res.status).toBe(201);
    expect(res.body.durationSec).toBe(900);
  });

  it('rejects sets on a completed session', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);
    await request(app).post(`/api/sessions/${session.id}/complete`).send({});

    const res = await request(app).post(`/api/sessions/${session.id}/sets`).send({
      exerciseName: 'Bench Press',
      weight: 185,
      reps: 8,
      setNumber: 1,
    });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/sessions/:id/sets/:setId', () => {
  it('rejects updating a set that belongs to another session', async () => {
    const { push, pull } = await seedProgram();
    const sessionA = await startSession(push.id);
    const sessionB = await startSession(pull.id);

    const logged = await request(app).post(`/api/sessions/${sessionB.id}/sets`).send({
      exerciseName: 'Barbell Row',
      weight: 135,
      reps: 10,
      setNumber: 1,
    });

    const res = await request(app)
      .put(`/api/sessions/${sessionA.id}/sets/${logged.body.id}`)
      .send({ weight: 999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Set does not belong to this session');
  });

  it('returns 400 for non-numeric set ids', async () => {
    const res = await request(app).put('/api/sessions/1/sets/abc').send({ weight: 100 });
    expect(res.status).toBe(400);
  });

  it('re-points a program set at a different exercise (swap carry-over)', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);
    const exercise = await Exercise.findOne({ where: { workoutId: push.id } });

    const logged = await request(app).post(`/api/sessions/${session.id}/sets`).send({
      exerciseId: exercise!.id,
      exerciseName: 'Bench Press',
      weight: 185,
      reps: 8,
      setNumber: 1,
    });
    expect(logged.body.exerciseId).toBe(exercise!.id);

    const res = await request(app)
      .put(`/api/sessions/${session.id}/sets/${logged.body.id}`)
      .send({ exerciseName: 'Dumbbell Press', exerciseId: null });

    expect(res.status).toBe(200);
    expect(res.body.exerciseName).toBe('Dumbbell Press');
    expect(res.body.exerciseId).toBeNull();
    expect(res.body.weight).toBe(185);
  });

  it('rejects re-pointing a set at a positive exerciseId', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);

    const logged = await request(app).post(`/api/sessions/${session.id}/sets`).send({
      exerciseName: 'Bench Press',
      weight: 185,
      reps: 8,
      setNumber: 1,
    });

    const res = await request(app)
      .put(`/api/sessions/${session.id}/sets/${logged.body.id}`)
      .send({ exerciseName: 'Dumbbell Press', exerciseId: 7 });

    expect(res.status).toBe(400);
  });
});

describe('sets ordering — performed order', () => {
  it('returns sets in insertion (id) order on GET /:id and /history', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);

    // Interleaved logging: Bench 1 → Row 1 → Bench 2 (out of program order)
    const performed = [
      { exerciseName: 'Bench Press', setNumber: 1 },
      { exerciseName: 'Barbell Row', setNumber: 1 },
      { exerciseName: 'Bench Press', setNumber: 2 },
    ];
    for (const set of performed) {
      const res = await request(app)
        .post(`/api/sessions/${session.id}/sets`)
        .send({ ...set, weight: 135, reps: 8 });
      expect(res.status).toBe(201);
    }
    await request(app).post(`/api/sessions/${session.id}/complete`).send({});

    const one = await request(app).get(`/api/sessions/${session.id}`);
    expect(one.body.sets.map((s: { exerciseName: string }) => s.exerciseName))
      .toEqual(['Bench Press', 'Barbell Row', 'Bench Press']);

    const history = await request(app).get('/api/sessions/history');
    const ids = history.body[0].sets.map((s: { id: number }) => s.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(history.body[0].sets.map((s: { exerciseName: string }) => s.exerciseName))
      .toEqual(['Bench Press', 'Barbell Row', 'Bench Press']);
  });
});

describe('POST /api/sessions/:id/complete', () => {
  it('advances currentWorkoutIndex modulo the workout count', async () => {
    const { program, push } = await seedProgram();

    const first = await startSession(push.id);
    await request(app).post(`/api/sessions/${first.id}/complete`).send({});
    await program.reload();
    expect(program.currentWorkoutIndex).toBe(1);

    const second = await startSession(push.id);
    await request(app).post(`/api/sessions/${second.id}/complete`).send({});
    await program.reload();
    expect(program.currentWorkoutIndex).toBe(0);
  });

  it('does not advance the program index for ad-hoc sessions', async () => {
    const { program, push } = await seedProgram();
    const session = await startSession(push.id, true);

    const res = await request(app).post(`/api/sessions/${session.id}/complete`).send({});

    expect(res.status).toBe(200);
    await program.reload();
    expect(program.currentWorkoutIndex).toBe(0);
  });

  it('rejects completing a session twice', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);

    await request(app).post(`/api/sessions/${session.id}/complete`).send({});
    const res = await request(app).post(`/api/sessions/${session.id}/complete`).send({});

    expect(res.status).toBe(400);
  });

  it('stores the heart-rate summary and series', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);

    const res = await request(app).post(`/api/sessions/${session.id}/complete`).send({
      heartRateAvg: 132,
      heartRateMin: 88,
      heartRateMax: 171,
      heartRateSeries: { t: [0, 60, 120], b: [95, 140, 150] },
    });

    expect(res.status).toBe(200);
    const stored = await Session.findByPk(session.id);
    expect(stored?.heartRateAvg).toBe(132);
    expect(JSON.parse(stored?.heartRateSeries ?? '')).toEqual({ t: [0, 60, 120], b: [95, 140, 150] });
  });
});

describe('POST /api/sessions/start', () => {
  it('starts a blank ad-hoc session without a workoutId', async () => {
    const res = await request(app).post('/api/sessions/start').send({});

    expect(res.status).toBe(201);
    expect(res.body.isAdHoc).toBe(true);
    expect(res.body.workoutId).toBeNull();
    expect(res.body.exercises).toEqual([]);
  });

  it('denormalizes program and workout names onto the session', async () => {
    const { push } = await seedProgram();

    const res = await request(app).post('/api/sessions/start').send({ workoutId: push.id });

    expect(res.status).toBe(201);
    expect(res.body.programName).toBe('PPL');
    expect(res.body.workoutName).toBe('Push');
    expect(res.body.exercises).toHaveLength(1);
  });
});

describe('GET /api/sessions/history — limit contract', () => {
  // Create `count` completed sessions directly (the route only returns rows with
  // a non-null completedAt). No sets needed — we assert on list length only.
  async function seedCompletedSessions(count: number) {
    const rows = Array.from({ length: count }, (_, i) => ({
      programId: null,
      programName: 'PPL',
      workoutId: null,
      workoutName: `Session ${i}`,
      completedAt: new Date(Date.now() - i * 86_400_000),
    }));
    await Session.bulkCreate(rows);
  }

  it('honors a limit above the old 100 cap instead of falling back to 50', async () => {
    await seedCompletedSessions(55);
    const res = await request(app).get('/api/sessions/history?limit=200');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(55);
  });

  it('clamps an over-cap limit to the request rather than falling back', async () => {
    await seedCompletedSessions(55);
    const res = await request(app).get('/api/sessions/history?limit=5000');
    expect(res.status).toBe(200);
    // Clamped to the 2000 cap (> 55 available), so all rows come back — never
    // the old 50-row fallback.
    expect(res.body).toHaveLength(55);
  });

  it('falls back to the default 50 for a non-numeric limit', async () => {
    await seedCompletedSessions(55);
    const res = await request(app).get('/api/sessions/history?limit=abc');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
  });

  it('defaults to 50 when no limit is provided', async () => {
    await seedCompletedSessions(55);
    const res = await request(app).get('/api/sessions/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
  });
});

describe('param validation', () => {
  it('returns 400 (not 500) for non-numeric session ids', async () => {
    const res = await request(app).get('/api/sessions/abc');
    expect(res.status).toBe(400);
  });
});
