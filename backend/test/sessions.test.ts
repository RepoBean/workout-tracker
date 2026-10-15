import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb, seed, find } from './app.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDb();
});

async function seedProgram() {
  const program = seed.program({ name: 'PPL', isActive: true });
  const push = seed.workout({ programId: program.id, name: 'Push', orderIndex: 0 });
  const pull = seed.workout({ programId: program.id, name: 'Pull', orderIndex: 1 });
  seed.exercise({
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

  it('accepts set add, edit and delete on a completed session (history editing)', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);
    await request(app).post(`/api/sessions/${session.id}/complete`).send({});

    const res = await request(app).post(`/api/sessions/${session.id}/sets`).send({
      exerciseName: 'Bench Press',
      weight: 185,
      reps: 8,
      setNumber: 1,
    });
    expect(res.status).toBe(201);
    // Stamped at the session's end, not now, so it stays inside the session window.
    expect(res.body.createdAt).toBe(find.session(session.id)?.completedAt?.toISOString());

    const put = await request(app).put(`/api/sessions/${session.id}/sets/${res.body.id}`).send({ reps: 9 });
    expect(put.status).toBe(200);
    expect(put.body.reps).toBe(9);

    const del = await request(app).delete(`/api/sessions/${session.id}/sets/${res.body.id}`);
    expect(del.status).toBe(204);
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
    const exercise = find.exerciseInWorkout(push.id);

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
    // The re-pointed name re-resolves the catalog identity
    const catalog = (await request(app).get('/api/catalog')).body as Array<{ id: number; name: string }>;
    expect(logged.body.catalogId).toBe(catalog.find((c) => c.name === 'Bench Press')!.id);
    expect(res.body.catalogId).toBe(catalog.find((c) => c.name === 'Dumbbell Press')!.id);
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

describe('assisted sets — negative weight', () => {
  it('logs a negative (assisted) weight and round-trips it', async () => {
    const { pull } = await seedProgram();
    const session = await startSession(pull.id);

    const res = await request(app).post(`/api/sessions/${session.id}/sets`).send({
      exerciseName: 'Neutral Grip Pull-Up', weight: -40, reps: 8, setNumber: 1,
    });
    expect(res.status).toBe(201);
    expect(res.body.weight).toBe(-40);

    const got = await request(app).get(`/api/sessions/${session.id}`);
    expect(got.body.sets[0].weight).toBe(-40);
  });

  it('updates an existing set to a negative weight', async () => {
    const { pull } = await seedProgram();
    const session = await startSession(pull.id);
    const logged = await request(app).post(`/api/sessions/${session.id}/sets`).send({
      exerciseName: 'Neutral Grip Pull-Up', weight: 0, reps: 8, setNumber: 1,
    });

    const res = await request(app)
      .put(`/api/sessions/${session.id}/sets/${logged.body.id}`)
      .send({ weight: -35 });
    expect(res.status).toBe(200);
    expect(res.body.weight).toBe(-35);
  });

  it('rejects weights below the -500 floor', async () => {
    const { pull } = await seedProgram();
    const session = await startSession(pull.id);

    const res = await request(app).post(`/api/sessions/${session.id}/sets`).send({
      exerciseName: 'Neutral Grip Pull-Up', weight: -600, reps: 8, setNumber: 1,
    });
    expect(res.status).toBe(400);
  });

  it('exports a negative weight as a numeric CSV cell, not a quoted text cell', async () => {
    const { pull } = await seedProgram();
    const session = await startSession(pull.id);
    await request(app).post(`/api/sessions/${session.id}/sets`).send({
      exerciseName: 'Neutral Grip Pull-Up', weight: -40, reps: 8, setNumber: 1,
    });
    await request(app).post(`/api/sessions/${session.id}/complete`).send({});

    const res = await request(app).get('/api/sessions/export-csv');
    expect(res.status).toBe(200);
    expect(res.text).toContain(',-40,8,');
    expect(res.text).not.toContain("'-40");
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
    const stored = find.session(session.id);
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
    seed.sessions(rows);
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

describe('history editing (v4 C1)', () => {
  const setBody = { exerciseName: 'Bench Press', weight: 185, reps: 8, setNumber: 1 };
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

  async function sessionUpdatedAt(id: number) {
    const res = await request(app).get(`/api/sessions/${id}`);
    return Date.parse(res.body.updatedAt);
  }

  it('bumps the session updatedAt on set POST, PUT and DELETE', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);
    let last = await sessionUpdatedAt(session.id);
    const tick = () => new Promise(r => setTimeout(r, 5));

    await tick();
    const logged = await request(app).post(`/api/sessions/${session.id}/sets`).send(setBody);
    const afterPost = await sessionUpdatedAt(session.id);
    expect(afterPost).toBeGreaterThan(last);
    last = afterPost;

    await tick();
    await request(app).put(`/api/sessions/${session.id}/sets/${logged.body.id}`).send({ weight: 190 });
    const afterPut = await sessionUpdatedAt(session.id);
    expect(afterPut).toBeGreaterThan(last);
    last = afterPut;

    await tick();
    await request(app).delete(`/api/sessions/${session.id}/sets/${logged.body.id}`);
    expect(await sessionUpdatedAt(session.id)).toBeGreaterThan(last);
  });

  it('/start with completedAt creates a completed ad-hoc session that never shows as active', async () => {
    const { program, push } = await seedProgram();
    const completedAt = hoursAgo(48);

    const res = await request(app).post('/api/sessions/start')
      .send({ workoutId: push.id, isAdHoc: false, completedAt, durationMin: 45 });

    expect(res.status).toBe(201);
    expect(res.body.isAdHoc).toBe(true);
    expect(res.body.completedAt).toBe(completedAt);
    expect(Date.parse(res.body.completedAt) - Date.parse(res.body.createdAt)).toBe(45 * 60_000);
    expect(res.body.exercises).toHaveLength(1);

    const active = await request(app).get('/api/sessions/active');
    expect(active.body).toBeNull();
    await program.reload();
    expect(program.currentWorkoutIndex).toBe(0);
  });

  it('/start with completedAt defaults to 60 minutes, also for a blank session', async () => {
    const completedAt = hoursAgo(5);
    const res = await request(app).post('/api/sessions/start').send({ completedAt });

    expect(res.status).toBe(201);
    expect(res.body.workoutName).toBe('Quick Workout');
    expect(Date.parse(res.body.completedAt) - Date.parse(res.body.createdAt)).toBe(60 * 60_000);
  });

  it('/start rejects a future completedAt', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const res = await request(app).post('/api/sessions/start').send({ completedAt: future });
    expect(res.status).toBe(400);
  });

  it('PUT /:id moves the session and its sets by the same delta', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);
    const logged = await request(app).post(`/api/sessions/${session.id}/sets`).send(setBody);
    await request(app).post(`/api/sessions/${session.id}/complete`).send({});
    const before = (await request(app).get(`/api/sessions/${session.id}`)).body;

    const target = hoursAgo(24 * 30);
    const res = await request(app).put(`/api/sessions/${session.id}`).send({ completedAt: target });

    expect(res.status).toBe(200);
    expect(res.body.completedAt).toBe(target);
    const delta = Date.parse(target) - Date.parse(before.completedAt);
    expect(Date.parse(res.body.createdAt)).toBe(Date.parse(before.createdAt) + delta);
    const set = res.body.sets.find((s: { id: number }) => s.id === logged.body.id);
    expect(Date.parse(set.createdAt)).toBe(Date.parse(logged.body.createdAt) + delta);
    expect(set.updatedAt).toBe(before.sets[0].updatedAt);
  });

  it('PUT /:id: history follows the new date', async () => {
    const { push } = await seedProgram();
    const a = await startSession(push.id);
    await request(app).post(`/api/sessions/${a.id}/complete`).send({});
    const b = await startSession(push.id);
    await request(app).post(`/api/sessions/${b.id}/complete`).send({});

    await request(app).put(`/api/sessions/${b.id}`).send({ completedAt: hoursAgo(72) });

    const history = await request(app).get('/api/sessions/history');
    expect(history.body.map((s: { id: number }) => s.id)).toEqual([a.id, b.id]);
  });

  it('PUT /:id rejects a future date, an incomplete session and a missing one', async () => {
    const { push } = await seedProgram();
    const session = await startSession(push.id);
    const future = new Date(Date.now() + 3_600_000).toISOString();

    expect((await request(app).put(`/api/sessions/${session.id}`).send({ completedAt: hoursAgo(1) })).status).toBe(400);
    await request(app).post(`/api/sessions/${session.id}/complete`).send({});
    expect((await request(app).put(`/api/sessions/${session.id}`).send({ completedAt: future })).status).toBe(400);
    expect((await request(app).put('/api/sessions/99999').send({ completedAt: hoursAgo(1) })).status).toBe(404);
  });

  it('/stats.lastUpdatedAt moves when a set in an old session is edited', async () => {
    const { push } = await seedProgram();
    const old = await startSession(push.id);
    const logged = await request(app).post(`/api/sessions/${old.id}/sets`).send(setBody);
    await request(app).post(`/api/sessions/${old.id}/complete`).send({});
    const recent = await startSession(push.id);
    await request(app).post(`/api/sessions/${recent.id}/complete`).send({});
    const before = (await request(app).get('/api/sessions/stats')).body.lastUpdatedAt;

    await new Promise(r => setTimeout(r, 5));
    await request(app).put(`/api/sessions/${old.id}/sets/${logged.body.id}`).send({ weight: 95 });

    const after = (await request(app).get('/api/sessions/stats')).body.lastUpdatedAt;
    expect(Date.parse(after)).toBeGreaterThan(Date.parse(before));
  });

  it('CSV dates use the local calendar day', async () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      // 2026-10-10 23:30 Eastern = 2026-10-11 03:30 UTC
      const res = await request(app).post('/api/sessions/start').send({ completedAt: '2026-10-11T03:30:00.000Z' });
      await request(app).post(`/api/sessions/${res.body.id}/sets`).send(setBody);

      const csv = await request(app).get('/api/sessions/export-csv');
      expect(csv.text.split('\n')[1].startsWith('2026-10-10,')).toBe(true);
    } finally {
      process.env.TZ = tz;
    }
  });
});
