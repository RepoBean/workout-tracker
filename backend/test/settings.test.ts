import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createTestApp, resetDb } from './app.js';

// /api/settings: null for never-stored keys, per-key value schemas, last write wins,
// and the coach thread's updatedAt check (409) between two devices.

const app = createTestApp();

beforeEach(async () => {
  await resetDb();
});

const PROFILE = { dob: '1985-04-02', sex: 'male', restingHr: 55, maxHrOverride: null };
const PROGRESSION = { enabled: true, incrementLbs: 5 };
const AI_COACH = { enabled: true, provider: 'anthropic', apiKey: 'sk-test', model: 'claude-x', baseUrl: '' };

const put = (key: string, body: object) => request(app).put(`/api/settings/${key}`).send(body);

describe('GET /api/settings', () => {
  it('returns null for every key on an empty DB (no defaults)', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ profile: null, progression: null, aiCoach: null, coachThread: null });
  });
});

describe('PUT /api/settings/:key', () => {
  it('stores each key and GET returns it with updatedAt', async () => {
    expect((await put('profile', { value: PROFILE })).status).toBe(200);
    expect((await put('progression', { value: PROGRESSION })).status).toBe(200);
    expect((await put('aiCoach', { value: AI_COACH })).status).toBe(200);

    const res = await request(app).get('/api/settings');
    expect(res.body.profile.value).toEqual(PROFILE);
    expect(res.body.progression.value).toEqual(PROGRESSION);
    expect(res.body.aiCoach.value).toEqual(AI_COACH);
    expect(res.body.coachThread).toBeNull();
    expect(Date.parse(res.body.profile.updatedAt)).not.toBeNaN();
  });

  it('strips unknown fields, including the per-device bodyweight', async () => {
    const res = await put('profile', { value: { ...PROFILE, bodyweight: 180, extra: 1 } });
    expect(res.status).toBe(200);
    expect(res.body.value).toEqual(PROFILE);
  });

  it('last write wins for non-thread keys and ignores baseUpdatedAt', async () => {
    await put('progression', { value: PROGRESSION });
    const res = await put('progression', { value: { enabled: false, incrementLbs: 2.5 }, baseUpdatedAt: null });
    expect(res.status).toBe(200);
    const got = await request(app).get('/api/settings');
    expect(got.body.progression.value).toEqual({ enabled: false, incrementLbs: 2.5 });
  });

  it('rejects an unknown key and out-of-range values', async () => {
    expect((await put('theme', { value: 'dark' })).status).toBe(400);
    expect((await put('profile', { value: { ...PROFILE, restingHr: 10 } })).status).toBe(400);
    expect((await put('progression', { value: { enabled: true, incrementLbs: 0 } })).status).toBe(400);
    expect((await put('aiCoach', { value: { ...AI_COACH, provider: 'nope' } })).status).toBe(400);
    expect((await request(app).get('/api/settings')).body.profile).toBeNull();
  });
});

describe('coachThread', () => {
  const thread = [
    { role: 'user', content: 'How was last week?' },
    { role: 'assistant', content: 'Solid.' },
  ];

  it('requires baseUpdatedAt', async () => {
    expect((await put('coachThread', { value: thread })).status).toBe(400);
  });

  it('creates with baseUpdatedAt null, then chains on the returned updatedAt', async () => {
    const first = await put('coachThread', { value: thread, baseUpdatedAt: null });
    expect(first.status).toBe(200);

    const second = await put('coachThread', { value: [], baseUpdatedAt: first.body.updatedAt });
    expect(second.status).toBe(200);
    expect(second.body.value).toEqual([]);
  });

  it('409s a stale write and returns the current thread', async () => {
    const first = await put('coachThread', { value: thread, baseUpdatedAt: null });
    // A second device that never saw the row
    const stale = await put('coachThread', { value: [{ role: 'user', content: 'other' }], baseUpdatedAt: null });
    expect(stale.status).toBe(409);
    expect(stale.body.current.value).toEqual(thread);
    expect(stale.body.current.updatedAt).toBe(first.body.updatedAt);

    const older = await put('coachThread', { value: [], baseUpdatedAt: '2020-01-01T00:00:00.000Z' });
    expect(older.status).toBe(409);
  });

  it('accepts a ~300 KB thread and answers 413 (not 500) past 1 MB', async () => {
    const big = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: 'x'.repeat(7_500),
    }));
    expect((await put('coachThread', { value: big, baseUpdatedAt: null })).status).toBe(200);

    const huge = Array.from({ length: 40 }, () => ({ role: 'user', content: 'y'.repeat(30_000) }));
    const res = await put('coachThread', { value: huge, baseUpdatedAt: null });
    expect(res.status).toBe(413);
  });
});

describe('error handler', () => {
  it('answers malformed JSON with 400 and never logs the body', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const path of ['/api/settings/aiCoach', '/api/programs']) {
      const res = await request(app)
        .put(path)
        .set('Content-Type', 'application/json')
        .send('{"value":{"apiKey":"sk-secret-key"');
      expect(res.status).toBe(400);
    }
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain('sk-secret-key');
    spy.mockRestore();
  });
});
