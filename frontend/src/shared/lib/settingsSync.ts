import axios from 'axios';
import { api } from '../api/client';

/**
 * Per-instance settings on the server (v4 C2, docs/v4-bundle-c2-settings.md).
 *
 * localStorage stays the synchronous cache: the contexts render from it, hydrate from the
 * server once per page load, and write through on change. An older backend 404s
 * `/api/settings`; that, or any network failure, is "unavailable" and the client keeps
 * using its local copy (never an error).
 */

export type SettingKey = 'profile' | 'progression' | 'aiCoach' | 'coachThread';

export interface ServerEntry {
  value: unknown;
  updatedAt: string;
}

export type ServerSettings = Record<SettingKey, ServerEntry | null>;

export type LoadResult = { available: true; settings: ServerSettings } | { available: false };

export type PutResult =
  | { ok: true; entry: ServerEntry }
  | { ok: false; conflict: ServerEntry | null }
  | { ok: false; unavailable: true };

/** JSON with sorted object keys, so two equal values always compare equal as text. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

// ---- Last-synced markers (per device, never sent) ----

/** The server copy this device last agreed with, per key. */
export interface SyncedMarker {
  updatedAt: string;
  json: string;
}

const SYNCED_KEY = 'wt:settings-synced';

function readMarkers(): Partial<Record<SettingKey, SyncedMarker>> {
  try {
    const raw = localStorage.getItem(SYNCED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readSynced(key: SettingKey): SyncedMarker | undefined {
  return readMarkers()[key];
}

export function writeSynced(key: SettingKey, marker: SyncedMarker): void {
  try {
    const markers = readMarkers();
    markers[key] = marker;
    localStorage.setItem(SYNCED_KEY, JSON.stringify(markers));
  } catch {
    // ignore quota errors
  }
}

// ---- Reconcile (pure) ----

export type ReconcileAction =
  | { type: 'none' }
  | { type: 'upload'; baseUpdatedAt: string | null }
  | { type: 'apply'; entry: ServerEntry };

/**
 * What to do with one key once the server has answered.
 *
 * - Server has nothing: the one-time migration — upload the local copy unless it is
 *   still the default (then there is nothing worth storing).
 * - Server unchanged since this device last agreed with it, local unchanged too: nothing.
 * - Server unchanged, local changed: a change the server never got (a failed PUT, or one
 *   made on an older image during a rollback). Upload it.
 * - Server changed since (another device, or this device never synced): server wins.
 */
export function reconcile(args: {
  server: ServerEntry | null;
  localJson: string;
  localIsDefault: boolean;
  synced: SyncedMarker | undefined;
}): ReconcileAction {
  const { server, localJson, localIsDefault, synced } = args;
  if (!server) return localIsDefault ? { type: 'none' } : { type: 'upload', baseUpdatedAt: null };
  if (synced && synced.updatedAt === server.updatedAt) {
    return localJson === synced.json ? { type: 'none' } : { type: 'upload', baseUpdatedAt: server.updatedAt };
  }
  return { type: 'apply', entry: server };
}

// ---- API ----

let initialLoad: Promise<LoadResult> | null = null;

async function fetchSettings(): Promise<LoadResult> {
  try {
    const { data } = await api.get<ServerSettings>('/settings');
    if (!data || typeof data !== 'object') return { available: false };
    return { available: true, settings: data };
  } catch {
    return { available: false };
  }
}

/** The page-load GET, shared by every settings context. Never rejects. */
export function loadServerSettings(): Promise<LoadResult> {
  initialLoad ??= fetchSettings();
  return initialLoad;
}

/** A fresh GET (the coach thread reloads on page focus). Never rejects. */
export function refetchServerSettings(): Promise<LoadResult> {
  return fetchSettings();
}

/** Store one key. Never rejects: a 409 carries the current entry, anything else is "unavailable". */
export async function putSetting(
  key: SettingKey,
  value: unknown,
  baseUpdatedAt?: string | null
): Promise<PutResult> {
  try {
    const body = baseUpdatedAt === undefined ? { value } : { value, baseUpdatedAt };
    const { data } = await api.put<ServerEntry>(`/settings/${key}`, body);
    return { ok: true, entry: data };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      const current = (err.response.data as { current?: ServerEntry | null })?.current ?? null;
      return { ok: false, conflict: current };
    }
    return { ok: false, unavailable: true };
  }
}

/** Test hook: forget the memoized page-load GET. */
export function resetSettingsSyncForTests(): void {
  initialLoad = null;
}
