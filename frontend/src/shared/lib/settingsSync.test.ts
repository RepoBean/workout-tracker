import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

vi.mock('../api/client', () => ({ api: { get: vi.fn(), put: vi.fn() } }));

import { api } from '../api/client';
import {
  loadServerSettings,
  putSetting,
  readSynced,
  reconcile,
  resetSettingsSyncForTests,
  stableJson,
  writeSynced,
} from './settingsSync';

const get = vi.mocked(api.get);
const put = vi.mocked(api.put);

function httpError(status: number, data: unknown = {}) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('fail', String(status), config, null, {
    status, statusText: '', headers: {}, config, data,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetSettingsSyncForTests();
});

describe('stableJson', () => {
  it('ignores object key order but not array order', () => {
    expect(stableJson({ a: 1, b: { d: 2, c: 3 } })).toBe(stableJson({ b: { c: 3, d: 2 }, a: 1 }));
    expect(stableJson([1, 2])).not.toBe(stableJson([2, 1]));
  });
});

describe('reconcile', () => {
  const server = { value: { enabled: true }, updatedAt: '2026-10-15T10:00:00.000Z' };
  const serverJson = stableJson(server.value);

  it('migrates: server empty → upload a non-default local copy', () => {
    expect(reconcile({ server: null, localJson: '{"enabled":false}', localIsDefault: false, synced: undefined }))
      .toEqual({ type: 'upload', baseUpdatedAt: null });
  });

  it('server empty and local still default → nothing to store', () => {
    expect(reconcile({ server: null, localJson: '{}', localIsDefault: true, synced: undefined }))
      .toEqual({ type: 'none' });
  });

  it('server unchanged since last sync, local unchanged → nothing', () => {
    const synced = { updatedAt: server.updatedAt, json: serverJson };
    expect(reconcile({ server, localJson: serverJson, localIsDefault: false, synced })).toEqual({ type: 'none' });
  });

  it('server unchanged, local changed (failed write / rollback window) → upload', () => {
    const synced = { updatedAt: server.updatedAt, json: serverJson };
    expect(reconcile({ server, localJson: '{"enabled":false}', localIsDefault: false, synced }))
      .toEqual({ type: 'upload', baseUpdatedAt: server.updatedAt });
  });

  it('server changed elsewhere → server wins, even over a local change', () => {
    const synced = { updatedAt: '2026-10-01T00:00:00.000Z', json: '{"enabled":false}' };
    expect(reconcile({ server, localJson: '{"enabled":"local"}', localIsDefault: false, synced }))
      .toEqual({ type: 'apply', entry: server });
  });

  it('second device (never synced) → server wins over its local copy', () => {
    expect(reconcile({ server, localJson: '{"enabled":false}', localIsDefault: false, synced: undefined }))
      .toEqual({ type: 'apply', entry: server });
  });
});

describe('synced markers', () => {
  it('round-trip per key through localStorage', () => {
    writeSynced('profile', { updatedAt: 'a', json: '{}' });
    writeSynced('aiCoach', { updatedAt: 'b', json: '[]' });
    expect(readSynced('profile')).toEqual({ updatedAt: 'a', json: '{}' });
    expect(readSynced('aiCoach')).toEqual({ updatedAt: 'b', json: '[]' });
    expect(readSynced('progression')).toBeUndefined();
  });
});

describe('loadServerSettings', () => {
  it('a 404 (older backend) is "unavailable", not an error', async () => {
    get.mockRejectedValueOnce(httpError(404));
    await expect(loadServerSettings()).resolves.toEqual({ available: false });
  });

  it('is fetched once per page load', async () => {
    const settings = { profile: null, progression: null, aiCoach: null, coachThread: null };
    get.mockResolvedValue({ data: settings });
    await loadServerSettings();
    await expect(loadServerSettings()).resolves.toEqual({ available: true, settings });
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('putSetting', () => {
  it('returns the stored entry', async () => {
    put.mockResolvedValueOnce({ data: { value: [], updatedAt: 'x' } });
    await expect(putSetting('coachThread', [], null)).resolves.toEqual({ ok: true, entry: { value: [], updatedAt: 'x' } });
    expect(put).toHaveBeenCalledWith('/settings/coachThread', { value: [], baseUpdatedAt: null });
  });

  it('omits baseUpdatedAt for last-write-wins keys', async () => {
    put.mockResolvedValueOnce({ data: { value: {}, updatedAt: 'x' } });
    await putSetting('progression', {});
    expect(put).toHaveBeenCalledWith('/settings/progression', { value: {} });
  });

  it('a 409 carries the current entry', async () => {
    const current = { value: [{ role: 'user', content: 'hi' }], updatedAt: 'y' };
    put.mockRejectedValueOnce(httpError(409, { error: 'x', current }));
    await expect(putSetting('coachThread', [], 'old')).resolves.toEqual({ ok: false, conflict: current });
  });

  it('anything else is "unavailable"', async () => {
    put.mockRejectedValueOnce(httpError(500));
    await expect(putSetting('profile', {})).resolves.toEqual({ ok: false, unavailable: true });
  });
});
