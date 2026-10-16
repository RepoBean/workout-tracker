import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb } from './app.js';

// /api/bodyweights: one weigh-in per local day (POST the same day overwrites), date/weight
// validation, PUT date clashes → 409.

const app = createTestApp();

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.useRealTimers();
});

const post = (body: object) => request(app).post('/api/bodyweights').send(body);

describe('GET /api/bodyweights', () => {
  it('is an empty array on an empty DB', async () => {
    const res = await request(app).get('/api/bodyweights');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns weigh-ins oldest first', async () => {
    await post({ date: '2026-10-10', weight: 182.4 });
    await post({ date: '2026-01-05', weight: 190 });
    await post({ date: '2026-06-01', weight: 186 });
    const res = await request(app).get('/api/bodyweights');
    expect(res.body.map((r: { date: string }) => r.date)).toEqual(['2026-01-05', '2026-06-01', '2026-10-10']);
    expect(res.body[2]).toMatchObject({ date: '2026-10-10', weight: 182.4 });
    expect(Date.parse(res.body[2].updatedAt)).not.toBeNaN();
  });
});

describe('POST /api/bodyweights', () => {
  it('inserts (201), then overwrites the same day (200) and bumps updatedAt', async () => {
    const first = await post({ date: '2026-10-10', weight: 185 });
    expect(first.status).toBe(201);

    await new Promise((r) => setTimeout(r, 5));
    const again = await post({ date: '2026-10-10', weight: 184 });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(again.body.weight).toBe(184);
    expect(Date.parse(again.body.updatedAt)).toBeGreaterThan(Date.parse(first.body.updatedAt));

    const all = await request(app).get('/api/bodyweights');
    expect(all.body).toHaveLength(1);
  });

  it('rejects out-of-range weights, bad dates and future dates', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 12, 0, 0));
    expect((await post({ date: '2026-10-10', weight: 49.9 })).status).toBe(400);
    expect((await post({ date: '2026-10-10', weight: 700.1 })).status).toBe(400);
    expect((await post({ date: '2026-10-10', weight: '180' })).status).toBe(400);
    expect((await post({ date: '2026-02-30', weight: 180 })).status).toBe(400);
    expect((await post({ date: '10/10/2026', weight: 180 })).status).toBe(400);
    expect((await post({ date: '2026-10-18', weight: 180 })).status).toBe(400);
    expect((await post({ weight: 180 })).status).toBe(400);
    // Tomorrow is allowed (a phone ahead of the server's zone)
    expect((await post({ date: '2026-10-17', weight: 180 })).status).toBe(201);
    expect((await post({ date: '2020-01-01', weight: 50 })).status).toBe(201);
  });
});

describe('PUT /api/bodyweights/:id', () => {
  it('changes weight and date', async () => {
    const { body } = await post({ date: '2026-10-10', weight: 185 });
    const res = await request(app).put(`/api/bodyweights/${body.id}`).send({ weight: 183.5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ date: '2026-10-10', weight: 183.5 });

    const moved = await request(app).put(`/api/bodyweights/${body.id}`).send({ date: '2026-10-09' });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ date: '2026-10-09', weight: 183.5 });
  });

  it('409s when moving onto another weigh-in\'s date, allows its own date', async () => {
    const a = await post({ date: '2026-10-10', weight: 185 });
    await post({ date: '2026-10-11', weight: 184 });
    expect((await request(app).put(`/api/bodyweights/${a.body.id}`).send({ date: '2026-10-11' })).status).toBe(409);
    expect((await request(app).put(`/api/bodyweights/${a.body.id}`).send({ date: '2026-10-10', weight: 186 })).status).toBe(200);
  });

  it('404s a missing id and 400s an empty body', async () => {
    expect((await request(app).put('/api/bodyweights/999').send({ weight: 180 })).status).toBe(404);
    const { body } = await post({ date: '2026-10-10', weight: 185 });
    expect((await request(app).put(`/api/bodyweights/${body.id}`).send({})).status).toBe(400);
    expect((await request(app).put('/api/bodyweights/abc').send({ weight: 180 })).status).toBe(400);
  });
});

describe('DELETE /api/bodyweights/:id', () => {
  it('deletes, then 404s', async () => {
    const { body } = await post({ date: '2026-10-10', weight: 185 });
    expect((await request(app).delete(`/api/bodyweights/${body.id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/bodyweights/${body.id}`)).status).toBe(404);
    expect((await request(app).get('/api/bodyweights')).body).toEqual([]);
  });
});
