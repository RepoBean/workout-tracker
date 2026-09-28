import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { sqlite } from '../src/db/index.js';
import { createTestApp, resetDb } from './app.js';

// The catalog over HTTP: write-path resolution, the /api/catalog list, and the
// merge/split tool on the real rename split (Low Incline Dumbbell Press, the old
// spelling, → Low Incline DB Press, the one in the current program).

const app = createTestApp();

beforeEach(async () => {
  await resetDb();
});

const OLD = 'Low Incline Dumbbell Press';
const NEW = 'Low Incline DB Press';

interface Entry {
  id: number; name: string; aliases: string[]; setCount: number; exerciseCount: number;
  createdAt: string; updatedAt: string;
}

async function importProgram(name: string, exerciseNames: string[]) {
  const res = await request(app).post('/api/programs/import').send({
    version: 1,
    program: {
      name,
      workouts: [{
        name: 'Upper', orderIndex: 0,
        exercises: exerciseNames.map((n, i) => ({ name: n, targetSets: 3, targetReps: '8-12', orderIndex: i })),
      }],
    },
  });
  expect(res.status).toBe(201);
  return res.body.workouts[0] as { id: number; exercises: Array<{ id: number; name: string; catalogId: number }> };
}

async function session(workoutId: number, sets: Array<{ exerciseName: string; exerciseId?: number; weight: number }>) {
  const started = await request(app).post('/api/sessions/start').send({ workoutId });
  expect(started.status).toBe(201);
  const logged = [];
  for (const [i, s] of sets.entries()) {
    const res = await request(app).post(`/api/sessions/${started.body.id}/sets`)
      .send({ reps: 10, setNumber: i + 1, ...s });
    expect(res.status).toBe(201);
    logged.push(res.body);
  }
  return { id: started.body.id as number, sets: logged };
}

async function complete(sessionId: number) {
  expect((await request(app).post(`/api/sessions/${sessionId}/complete`).send({})).status).toBe(200);
}

const list = async () => (await request(app).get('/api/catalog')).body as Entry[];
const entry = async (name: string) => (await list()).find((e) => e.name === name)!;
const rawSets = () =>
  sqlite.prepare('SELECT id, exerciseName, catalogId, updatedAt FROM Sets ORDER BY id').all() as
    Array<{ id: number; exerciseName: string; catalogId: number; updatedAt: string }>;

/** Old program (old spelling, 2 sets), then the current one (new spelling, 1 set). */
async function renameSplit() {
  const oldW = await importProgram('Old', [OLD, 'Leg Press']);
  const newW = await importProgram('Current', [NEW, 'Leg Press']);
  const s1 = await session(oldW.id, [
    { exerciseName: OLD, exerciseId: oldW.exercises[0].id, weight: 60 },
    { exerciseName: OLD, exerciseId: oldW.exercises[0].id, weight: 60 },
  ]);
  await complete(s1.id);
  const s2 = await session(newW.id, [{ exerciseName: NEW, exerciseId: newW.exercises[0].id, weight: 70 }]);
  await complete(s2.id);
  return { oldW, newW, s1, s2 };
}

describe('write paths resolve catalogId from the name', () => {
  it('sets, program exercises and imports all carry a resolved id; the client cannot set it', async () => {
    const { oldW, newW, s1, s2 } = await renameSplit();
    const oldId = (await entry(OLD)).id;
    const newId = (await entry(NEW)).id;
    const legPress = (await entry('Leg Press')).id;

    expect(oldW.exercises.map((e) => e.catalogId)).toEqual([oldId, legPress]);
    expect(newW.exercises.map((e) => e.catalogId)).toEqual([newId, legPress]);
    expect(s1.sets.map((s) => s.catalogId)).toEqual([oldId, oldId]);
    expect(s2.sets[0].catalogId).toBe(newId);

    // Request schemas don't know catalogId: a client-sent one is stripped
    const s3 = await session(newW.id, [{ exerciseName: 'leg press ', weight: 200, catalogId: 999 } as never]);
    expect(s3.sets[0].catalogId).toBe(legPress);
    const ex = await request(app).post('/api/exercises')
      .send({ workoutId: newW.id, name: 'Cable Fly', targetSets: 3, targetReps: '12', orderIndex: 2, catalogId: 999 });
    expect(ex.status).toBe(201);
    expect(ex.body.catalogId).toBe((await entry('Cable Fly')).id);
  });

  it('an exercise rename resolves to the new name; duplicates keep the identity', async () => {
    const w = await importProgram('P', ['Bench Press']);
    const benchId = w.exercises[0].catalogId;

    const renamed = await request(app).put(`/api/exercises/${w.exercises[0].id}`).send({ name: 'Floor Press' });
    expect(renamed.body.catalogId).toBe((await entry('Floor Press')).id);
    expect(renamed.body.catalogId).not.toBe(benchId);
    const retargeted = await request(app).put(`/api/exercises/${w.exercises[0].id}`).send({ targetSets: 4 });
    expect(retargeted.body.catalogId).toBe(renamed.body.catalogId);

    const dupW = await request(app).post(`/api/workouts/${w.id}/duplicate`);
    expect(dupW.body.exercises[0].catalogId).toBe(renamed.body.catalogId);
    const programs = (await request(app).get('/api/programs')).body as Array<{ id: number }>;
    const dupP = await request(app).post(`/api/programs/${programs[0].id}/duplicate`);
    expect(dupP.status).toBe(201);
    for (const wk of dupP.body.workouts) {
      for (const e of wk.exercises) expect(e.catalogId).toBe((await entry(e.name)).id);
    }
  });
});

describe('GET /api/catalog', () => {
  it('lists every entry, sorted by name, with set and program-exercise counts', async () => {
    await renameSplit();
    const entries = await list();
    expect(entries.map((e) => [e.name, e.setCount, e.exerciseCount])).toEqual([
      ['Leg Press', 0, 2],
      [NEW, 1, 1],
      [OLD, 2, 1],
    ]);
    expect(entries[0].aliases).toEqual([]);
    expect(entries[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('POST /api/catalog/:id/merge', () => {
  it('folds B into A: re-points sets and exercises, B becomes an alias, B is deleted, names untouched', async () => {
    const { newW } = await renameSplit();
    const a = await entry(NEW);
    const b = await entry(OLD);
    const before = rawSets();

    const res = await request(app).post(`/api/catalog/${a.id}/merge`).send({ fromId: b.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: a.id, name: NEW, aliases: [OLD], setCount: 3, exerciseCount: 2 });
    expect((await list()).map((e) => e.name)).toEqual(['Leg Press', NEW]);

    const after = rawSets();
    expect(after.map((s) => s.catalogId)).toEqual(before.map(() => a.id));
    expect(after.map((s) => [s.exerciseName, s.updatedAt])).toEqual(before.map((s) => [s.exerciseName, s.updatedAt]));

    // A set logged under B's name afterwards resolves to A via the alias
    const later = await session(newW.id, [{ exerciseName: OLD, weight: 75 }]);
    expect(later.sets[0].catalogId).toBe(a.id);
  });

  it("carries B's own aliases along", async () => {
    await renameSplit();
    const a = await entry('Leg Press');
    const b = await entry(NEW);
    await request(app).post(`/api/catalog/${b.id}/merge`).send({ fromId: (await entry(OLD)).id });
    const res = await request(app).post(`/api/catalog/${a.id}/merge`).send({ fromId: b.id });
    expect(res.body.aliases).toEqual([NEW, OLD]);
  });

  it('merged lookups: hints, PR sets and /previous answer as one lift under either name', async () => {
    const { oldW } = await renameSplit();
    const a = await entry(NEW);
    const b = await entry(OLD);

    const before = await request(app).get('/api/exercises/all-sets-by-name').query({ name: NEW });
    expect(before.body.sets).toHaveLength(1);

    await request(app).post(`/api/catalog/${a.id}/merge`).send({ fromId: b.id });

    for (const name of [NEW, OLD, 'low incline dumbbell press']) {
      const all = await request(app).get('/api/exercises/all-sets-by-name').query({ name });
      expect(all.body.sets.map((s: { weight: number }) => s.weight)).toEqual([70, 60, 60]);
      const hint = await request(app).get('/api/exercises/history-by-name').query({ name });
      expect(hint.body.sets).toEqual([{ setNumber: 1, weight: 70, reps: 10, perceivedEffort: null }]);
    }

    // A session on the OLD program: its exercise is still named the old spelling
    const s = await session(oldW.id, []);
    const prev = await request(app).get(`/api/sessions/${s.id}/previous`);
    expect(prev.body.exerciseData[oldW.exercises[0].id].sets).toEqual([
      { setNumber: 1, weight: 70, reps: 10, perceivedEffort: null },
    ]);
  });

  it('rejects self-merge (400), unknown ids (404), bad bodies (400) and alias clashes (409)', async () => {
    await renameSplit();
    const a = await entry(NEW);
    expect((await request(app).post(`/api/catalog/${a.id}/merge`).send({ fromId: a.id })).status).toBe(400);
    expect((await request(app).post(`/api/catalog/${a.id}/merge`).send({ fromId: 9999 })).status).toBe(404);
    expect((await request(app).post(`/api/catalog/9999/merge`).send({ fromId: a.id })).status).toBe(404);
    expect((await request(app).post(`/api/catalog/${a.id}/merge`).send({ fromId: 'x' })).status).toBe(400);
    expect((await request(app).post(`/api/catalog/abc/merge`).send({ fromId: a.id })).status).toBe(400);

    // Two rows claiming the same alias (not reachable through the API) → 409, nothing changes
    const ts = '2026-09-11 16:10:29.104 +00:00';
    sqlite.exec(`INSERT INTO ExerciseCatalog (name, aliases, createdAt, updatedAt) VALUES
      ('E1', '["Shared"]', '${ts}', '${ts}'), ('E2', '["Shared"]', '${ts}', '${ts}')`);
    const e2 = await entry('E2');
    const clash = await request(app).post(`/api/catalog/${a.id}/merge`).send({ fromId: e2.id });
    expect(clash.status).toBe(409);
    expect((await entry('E2')).id).toBe(e2.id);
    expect((await entry(NEW)).aliases).toEqual([]);
  });
});

describe('POST /api/catalog/:id/split', () => {
  it('restores the pre-merge state exactly: same rows re-pointed, same counts', async () => {
    await renameSplit();
    const a = await entry(NEW);
    const b = await entry(OLD);
    const before = rawSets();
    const countsBefore = (await list()).map((e) => [e.name, e.aliases, e.setCount, e.exerciseCount]);

    await request(app).post(`/api/catalog/${a.id}/merge`).send({ fromId: b.id });
    const res = await request(app).post(`/api/catalog/${a.id}/split`).send({ alias: ' low incline dumbbell press ' });
    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({ id: a.id, aliases: [], setCount: 1, exerciseCount: 1 });
    expect(res.body.created).toMatchObject({ name: OLD, aliases: [], setCount: 2, exerciseCount: 1 });

    expect((await list()).map((e) => [e.name, e.aliases, e.setCount, e.exerciseCount])).toEqual(countsBefore);
    const newB = res.body.created.id;
    // Exactly the rows that were B's before the merge point at the re-created entry
    expect(rawSets().map((s) => [s.id, s.catalogId === newB, s.updatedAt]))
      .toEqual(before.map((s) => [s.id, s.catalogId === b.id, s.updatedAt]));
  });

  it('404s for an unknown entry or a name that is not one of its aliases', async () => {
    await renameSplit();
    const a = await entry(NEW);
    expect((await request(app).post('/api/catalog/9999/split').send({ alias: OLD })).status).toBe(404);
    expect((await request(app).post(`/api/catalog/${a.id}/split`).send({ alias: OLD })).status).toBe(404);
    expect((await request(app).post(`/api/catalog/${a.id}/split`).send({ alias: '  ' })).status).toBe(400);
  });
});
