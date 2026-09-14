// Characterization tests — written against the Sequelize stack before the
// Drizzle swap (v3 Bundle 1) to pin down behaviour the ORM provided implicitly:
// cascades, timestamps, JSON shapes, date-bound parsing, case-insensitive name
// lookups, ordering. HTTP only: nothing here may import a model or the db.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb } from './app.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDb();
});

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function importProgram(name = 'PPL') {
  const res = await request(app).post('/api/programs/import').send({
    version: 1,
    program: {
      name,
      workouts: [
        {
          name: 'Push', orderIndex: 0,
          exercises: [
            { name: 'Bench Press', targetSets: 3, targetReps: '8-10', orderIndex: 0 },
            { name: 'Overhead Press', targetSets: 3, targetReps: '8-10', orderIndex: 1, supersetGroup: 'A' },
          ],
        },
        { name: 'Pull', orderIndex: 1, exercises: [] },
      ],
    },
  });
  expect(res.status).toBe(201);
  const program = res.body;
  const push = program.workouts[0];
  const pull = program.workouts[1];
  const bench = push.exercises[0];
  const ohp = push.exercises[1];
  return { program, push, pull, bench, ohp };
}

async function startSession(workoutId?: number, isAdHoc = false) {
  const res = await request(app).post('/api/sessions/start').send(workoutId ? { workoutId, isAdHoc } : {});
  expect(res.status).toBe(201);
  return res.body;
}

async function logSet(sessionId: number, body: Record<string, unknown>) {
  const res = await request(app).post(`/api/sessions/${sessionId}/sets`).send({
    weight: 135, reps: 8, setNumber: 1, ...body,
  });
  expect(res.status).toBe(201);
  return res.body;
}

async function complete(sessionId: number, body: Record<string, unknown> = {}) {
  const res = await request(app).post(`/api/sessions/${sessionId}/complete`).send(body);
  expect(res.status).toBe(200);
  return res.body;
}

describe('response shapes', () => {
  it('program → workouts → exercises carry exactly the known columns', async () => {
    const { program, push, bench } = await importProgram();

    expect(Object.keys(program).sort()).toEqual([
      'createdAt', 'currentWorkoutIndex', 'id', 'isActive', 'isArchived', 'name', 'updatedAt', 'workouts',
    ]);
    expect(Object.keys(push).sort()).toEqual([
      'createdAt', 'exercises', 'id', 'name', 'orderIndex', 'programId', 'updatedAt',
    ]);
    expect(Object.keys(bench).sort()).toEqual([
      'cardioModality', 'createdAt', 'exerciseType', 'id', 'name', 'orderIndex', 'supersetGroup',
      'targetDistance', 'targetDurationSec', 'targetReps', 'targetSets', 'updatedAt', 'workoutId',
    ]);
    expect(program.isActive).toBe(false);
    expect(program.isArchived).toBe(false);
    expect(bench.supersetGroup).toBeNull();
    expect(bench.cardioModality).toBeNull();
    expect(bench.targetDistance).toBeNull();
    expect(program.workouts[1].exercises).toEqual([]);
  });

  it('session and set rows carry exactly the known columns', async () => {
    const { push, bench } = await importProgram();
    const started = await startSession(push.id);
    const set = await logSet(started.id, { exerciseId: bench.id, exerciseName: 'Bench Press' });

    expect(Object.keys(set).sort()).toEqual([
      'createdAt', 'distance', 'dropIndex', 'durationSec', 'exerciseId', 'exerciseName', 'heartRateAvg',
      'heartRateMax', 'id', 'perceivedEffort', 'reps', 'sessionId', 'setNumber', 'updatedAt', 'weight',
    ]);
    expect(set.perceivedEffort).toBeNull();
    expect(set.dropIndex).toBe(0);
    expect(set.weight).toBe(135);

    const session = (await request(app).get(`/api/sessions/${started.id}`)).body;
    expect(Object.keys(session).sort()).toEqual([
      'completedAt', 'createdAt', 'exerciseNotes', 'exercises', 'heartRateAvg', 'heartRateMax', 'heartRateMin',
      'heartRateSeries', 'id', 'isAdHoc', 'programId', 'programName', 'sets', 'updatedAt', 'workoutId', 'workoutName',
    ]);
    expect(session.isAdHoc).toBe(false);
    expect(session.completedAt).toBeNull();
    expect(session.exerciseNotes).toBeNull();
    expect(session.heartRateSeries).toBeNull();
    expect(session.sets).toHaveLength(1);
    expect(session.exercises.map((e: { name: string }) => e.name)).toEqual(['Bench Press', 'Overhead Press']);
  });

  it('decimals come back as numbers, not strings', async () => {
    const { push } = await importProgram();
    const started = await startSession(push.id);
    const set = await logSet(started.id, { exerciseName: 'Cable Fly', weight: 42.5, reps: 12 });
    expect(set.weight).toBe(42.5);

    const cardio = await logSet(started.id, {
      exerciseName: 'Row', weight: 0, reps: 0, durationSec: 600, distance: 1.25,
    });
    expect(cardio.distance).toBe(1.25);

    const ex = await request(app).post('/api/exercises').send({
      workoutId: push.id, name: 'Run', targetSets: 1, targetReps: '1', orderIndex: 2,
      exerciseType: 'cardio', cardioModality: 'running', targetDistance: 3.1,
    });
    expect(ex.body.targetDistance).toBe(3.1);
  });
});

describe('timestamps', () => {
  it('are ISO strings; PUT bumps updatedAt and leaves createdAt alone', async () => {
    const created = (await request(app).post('/api/programs').send({ name: 'Stamp' })).body;
    expect(created.createdAt).toMatch(ISO_RE);
    expect(created.updatedAt).toMatch(ISO_RE);

    await sleep(5);
    const updated = (await request(app).put(`/api/programs/${created.id}`).send({ name: 'Stamp 2' })).body;
    expect(updated.createdAt).toBe(created.createdAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime());
  });

  it('completedAt is an ISO string once completed', async () => {
    const { push } = await importProgram();
    const started = await startSession(push.id);
    const done = await complete(started.id);
    expect(done.completedAt).toMatch(ISO_RE);
    expect(done.sets).toEqual([]);
  });
});

describe('cascades', () => {
  it('deleting a session deletes its sets', async () => {
    const { push } = await importProgram();
    const started = await startSession(push.id);
    await logSet(started.id, { exerciseName: 'Cascade Curl' });
    await complete(started.id);

    const before = await request(app).get('/api/exercises/all-sets-by-name?name=Cascade%20Curl');
    expect(before.body.sets).toHaveLength(1);

    const del = await request(app).delete(`/api/sessions/${started.id}`);
    expect(del.status).toBe(204);

    const after = await request(app).get('/api/exercises/all-sets-by-name?name=Cascade%20Curl');
    expect(after.body.sets).toEqual([]);
    expect((await request(app).get(`/api/sessions/${started.id}`)).status).toBe(404);
  });

  it('deleting a workout deletes its exercises and nulls the session link', async () => {
    const { push, bench } = await importProgram();
    const started = await startSession(push.id);
    expect(started.workoutId).toBe(push.id);

    const del = await request(app).delete(`/api/workouts/${push.id}`);
    expect(del.status).toBe(204);

    expect((await request(app).get(`/api/exercises/${bench.id}`)).status).toBe(404);
    const session = (await request(app).get(`/api/sessions/${started.id}`)).body;
    expect(session.workoutId).toBeNull();
    expect(session.workoutName).toBe('Push');
    expect(session.exercises).toEqual([]);
  });

  it('deleting an exercise nulls exerciseId on its sets but keeps the name', async () => {
    const { push, bench } = await importProgram();
    const started = await startSession(push.id);
    const set = await logSet(started.id, { exerciseId: bench.id, exerciseName: 'Bench Press' });
    expect(set.exerciseId).toBe(bench.id);

    await request(app).delete(`/api/exercises/${bench.id}`);

    const session = (await request(app).get(`/api/sessions/${started.id}`)).body;
    expect(session.sets[0].exerciseId).toBeNull();
    expect(session.sets[0].exerciseName).toBe('Bench Press');
  });
});

describe('GET /api/sessions/active', () => {
  it('returns the in-progress session with its exercises, then null once completed', async () => {
    expect((await request(app).get('/api/sessions/active')).body).toBeNull();

    const { push } = await importProgram();
    const started = await startSession(push.id);
    await logSet(started.id, { exerciseName: 'Bench Press' });

    const active = (await request(app).get('/api/sessions/active')).body;
    expect(active.id).toBe(started.id);
    expect(active.sets).toHaveLength(1);
    expect(active.exercises).toHaveLength(2);

    await complete(started.id);
    expect((await request(app).get('/api/sessions/active')).body).toBeNull();
  });
});

describe('GET /api/sessions/history — ordering and date bounds', () => {
  it('orders by completedAt DESC and only returns completed sessions', async () => {
    const { push, pull } = await importProgram();
    const first = await startSession(push.id);
    await complete(first.id);
    await sleep(5);
    const second = await startSession(pull.id);
    await complete(second.id);
    await startSession(push.id); // in progress — must not appear

    const res = await request(app).get('/api/sessions/history');
    expect(res.body.map((s: { id: number }) => s.id)).toEqual([second.id, first.id]);
  });

  it('accepts the bounds the calendar and coach actually send', async () => {
    const { push } = await importProgram();
    const started = await startSession(push.id);
    await complete(started.id);

    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const dayStart = `${day}T00:00:00.000Z`;
    const dayEnd = `${day}T23:59:59.999Z`;
    const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);

    const get = async (qs: string) => {
      const res = await request(app).get(`/api/sessions/history?${qs}`);
      expect(res.status).toBe(200);
      return res.body as unknown[];
    };

    // Calendar: full ISO bounds
    expect(await get(`from=${dayStart}&to=${dayEnd}`)).toHaveLength(1);
    // Coach: bare from-date + suffixed to-date (verified live 2026-09)
    expect(await get(`from=${day}&to=${dayEnd}`)).toHaveLength(1);
    // A bare to-date means midnight, so it excludes that day
    expect(await get(`to=${day}`)).toHaveLength(0);
    expect(await get(`from=${tomorrow}`)).toHaveLength(0);
    expect(await get(`from=${dayStart}&to=${dayStart}`)).toHaveLength(0);
  });
});

describe('name lookups are case-insensitive and pick the latest completed session', () => {
  it('/exercises/history-by-name', async () => {
    const { push } = await importProgram();

    const older = await startSession(push.id);
    await logSet(older.id, { exerciseName: 'Bench Press', weight: 135, reps: 10, setNumber: 1 });
    await complete(older.id);
    await sleep(5);

    const newer = await startSession(push.id);
    await logSet(newer.id, { exerciseName: 'bench press', weight: 155, reps: 8, setNumber: 1 });
    await logSet(newer.id, { exerciseName: 'bench press', weight: 155, reps: 7, setNumber: 2, perceivedEffort: 8 });
    await logSet(newer.id, { exerciseName: 'bench press', weight: 100, reps: 12, setNumber: 2, dropIndex: 1 });
    await complete(newer.id);

    const inProgress = await startSession(push.id);
    await logSet(inProgress.id, { exerciseName: 'BENCH PRESS', weight: 999, reps: 1, setNumber: 1 });

    const res = await request(app).get('/api/exercises/history-by-name?name=BENCH%20press');
    expect(res.status).toBe(200);
    expect(res.body.fromSessionDate).toMatch(ISO_RE);
    expect(res.body.sets).toEqual([
      { setNumber: 1, weight: 155, reps: 8, perceivedEffort: null },
      { setNumber: 2, weight: 155, reps: 7, perceivedEffort: 8 },
    ]);

    const none = await request(app).get('/api/exercises/history-by-name?name=Nope');
    expect(none.body).toEqual({ sets: [], fromSessionDate: null });
  });

  it('/exercises/all-sets-by-name returns every standard set, newest session first', async () => {
    const { push } = await importProgram();
    const older = await startSession(push.id);
    await logSet(older.id, { exerciseName: 'Squat', weight: 225, reps: 5 });
    await complete(older.id);
    await sleep(5);
    const newer = await startSession(push.id);
    await logSet(newer.id, { exerciseName: 'SQUAT', weight: 245, reps: 3 });
    await logSet(newer.id, { exerciseName: 'SQUAT', weight: 185, reps: 8, setNumber: 2, dropIndex: 1 });
    await complete(newer.id);

    const res = await request(app).get('/api/exercises/all-sets-by-name?name=squat');
    expect(res.body.sets.map((s: { weight: number }) => s.weight)).toEqual([245, 225]);
    expect(Object.keys(res.body.sets[0]).sort()).toEqual([
      'completedAt', 'distance', 'dropIndex', 'durationSec', 'reps', 'weight',
    ]);
    expect(res.body.sets[0].completedAt).toMatch(ISO_RE);
  });

  it('/sessions/:id/previous keys the latest sets by the workout exercise id', async () => {
    const { push, bench, ohp } = await importProgram();
    const older = await startSession(push.id);
    await logSet(older.id, { exerciseId: bench.id, exerciseName: 'Bench Press', weight: 135, reps: 10 });
    await complete(older.id);
    await sleep(5);
    const newer = await startSession(push.id);
    await logSet(newer.id, { exerciseName: 'BENCH PRESS', weight: 155, reps: 8, setNumber: 1 });
    await logSet(newer.id, { exerciseName: 'BENCH PRESS', weight: 155, reps: 6, setNumber: 2 });
    await complete(newer.id);

    const current = await startSession(push.id);
    const res = await request(app).get(`/api/sessions/${current.id}/previous`);
    expect(res.status).toBe(200);
    expect(res.body.exerciseData[bench.id].sets).toEqual([
      { setNumber: 1, weight: 155, reps: 8, perceivedEffort: null },
      { setNumber: 2, weight: 155, reps: 6, perceivedEffort: null },
    ]);
    expect(res.body.exerciseData[ohp.id]).toBeUndefined();

    const blank = await startSession();
    const empty = await request(app).get(`/api/sessions/${blank.id}/previous`);
    expect(empty.body).toEqual({ exerciseData: {} });
  });

  it('/exercises/suggestions matches program and history names case-insensitively', async () => {
    const { push } = await importProgram();
    const started = await startSession(push.id);
    await logSet(started.id, { exerciseName: 'Cable Press-down' });

    const res = await request(app).get('/api/exercises/suggestions?q=PRESS');
    expect(res.status).toBe(200);
    // Program exercise names first, then history names; alphabetical within each
    expect(res.body).toEqual(['Bench Press', 'Overhead Press', 'Cable Press-down']);
    expect((await request(app).get('/api/exercises/suggestions?q=p')).body).toEqual([]);
  });
});

describe('JSON and text columns', () => {
  it('exerciseNotes round-trips as an object and collapses to null when emptied', async () => {
    const { push } = await importProgram();
    const started = await startSession(push.id);

    const set = await request(app).put(`/api/sessions/${started.id}/exercise-note`)
      .send({ exerciseName: 'Bench Press', note: '  felt heavy  ' });
    expect(set.status).toBe(200);
    expect(set.body.exerciseNotes).toEqual({ 'Bench Press': 'felt heavy' });

    const fetched = (await request(app).get(`/api/sessions/${started.id}`)).body;
    expect(fetched.exerciseNotes).toEqual({ 'Bench Press': 'felt heavy' });

    const cleared = await request(app).put(`/api/sessions/${started.id}/exercise-note`)
      .send({ exerciseName: 'Bench Press', note: null });
    expect(cleared.body.exerciseNotes).toBeNull();
  });

  it('heartRateSeries is stored and returned as a JSON string', async () => {
    const { push } = await importProgram();
    const started = await startSession(push.id);
    const done = await complete(started.id, {
      heartRateAvg: 130, heartRateMin: 90, heartRateMax: 170,
      heartRateSeries: { t: [0, 5], b: [100, 120] },
    });
    expect(typeof done.heartRateSeries).toBe('string');
    expect(JSON.parse(done.heartRateSeries)).toEqual({ t: [0, 5], b: [100, 120] });
    expect(done.heartRateAvg).toBe(130);

    const history = (await request(app).get('/api/sessions/history')).body;
    expect(history[0].heartRateSeries).toBe(done.heartRateSeries);
  });
});

describe('programs list', () => {
  it('orders active first then by name, and hides archived unless asked', async () => {
    await importProgram('Zeta');
    const { program: alpha } = await importProgram('Alpha');
    const { program: mid } = await importProgram('Mid');
    await request(app).put(`/api/programs/${mid.id}/set-active`);
    await request(app).delete(`/api/programs/${alpha.id}`);

    const list = (await request(app).get('/api/programs')).body;
    expect(list.map((p: { name: string }) => p.name)).toEqual(['Mid', 'Zeta']);
    expect(list[0].isActive).toBe(true);
    expect(list[0].workouts[0].exercises[0].name).toBe('Bench Press');

    const all = (await request(app).get('/api/programs?includeArchived=true')).body;
    expect(all.map((p: { name: string }) => p.name)).toEqual(['Mid', 'Alpha', 'Zeta']);
    expect(all[1].isArchived).toBe(true);
  });
});

describe('stats and CSV', () => {
  it('stats counts completed sessions and reports a streak', async () => {
    const { push } = await importProgram();
    const started = await startSession(push.id);
    await complete(started.id);
    await startSession(push.id);

    const res = await request(app).get('/api/sessions/stats');
    expect(res.body).toEqual({ totalSessions: 1, sessionsLast30Days: 1, weekStreak: 1 });
  });

  it('export-csv emits one row per set with the fixed header', async () => {
    const { push } = await importProgram();
    const started = await startSession(push.id);
    await logSet(started.id, { exerciseName: 'Bench, Press', weight: 135, reps: 8 });
    await complete(started.id);

    const res = await request(app).get('/api/sessions/export-csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.split('\n');
    expect(lines[0]).toBe('Date,Program,Workout,Exercise,Set#,Weight(lbs),Reps,RPE,DropIndex,Duration(sec),Distance(mi),HR_Avg,HR_Max');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(`${new Date().toISOString().slice(0, 10)},PPL,Push,"Bench, Press",1,135,8,,0,,,,`);
  });
});

describe('workouts', () => {
  it('reorder endpoints rewrite orderIndex and GET returns exercises in order', async () => {
    const { program, push, pull, bench, ohp } = await importProgram();

    const reorderW = await request(app).post('/api/workouts/reorder').send({ workoutIds: [pull.id, push.id] });
    expect(reorderW.body).toEqual({ success: true });
    const prog = (await request(app).get(`/api/programs/${program.id}`)).body;
    expect(prog.workouts.map((w: { name: string }) => w.name)).toEqual(['Pull', 'Push']);

    const reorderE = await request(app).post(`/api/workouts/${push.id}/reorder-exercises`)
      .send({ exerciseIds: [ohp.id, bench.id] });
    expect(reorderE.body).toEqual({ success: true });
    const workout = (await request(app).get(`/api/workouts/${push.id}`)).body;
    expect(workout.exercises.map((e: { name: string }) => e.name)).toEqual(['Overhead Press', 'Bench Press']);
  });

  it('export strips ids and state', async () => {
    const { program } = await importProgram();
    const res = await request(app).get(`/api/programs/${program.id}/export`);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.program.name).toBe('PPL');
    expect(res.body.program.workouts[0].exercises[0]).toEqual({
      name: 'Bench Press', targetSets: 3, targetReps: '8-10', orderIndex: 0, supersetGroup: null,
      exerciseType: 'strength', cardioModality: null, targetDurationSec: null, targetDistance: null,
    });
  });
});
