import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react';
import {
  LoadResult,
  SettingKey,
  loadServerSettings,
  putSetting,
  readSynced,
  reconcile,
  stableJson,
  writeSynced,
} from '../lib/settingsSync';

/**
 * The page-load GET of `/api/settings`, shared by the profile, progression and AI coach
 * contexts (and the coach thread). `load` is null until it settles; then it is the result,
 * available or not. See docs/v4-bundle-c2-settings.md.
 */
interface SettingsSyncValue {
  load: LoadResult | null;
}

const SettingsSyncContext = createContext<SettingsSyncValue | undefined>(undefined);

export function SettingsSyncProvider({ children }: { children: ReactNode }) {
  const [load, setLoad] = useState<LoadResult | null>(null);

  useEffect(() => {
    let alive = true;
    loadServerSettings().then((result) => {
      if (alive) setLoad(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  return <SettingsSyncContext.Provider value={{ load }}>{children}</SettingsSyncContext.Provider>;
}

export function useSettingsSync() {
  const context = useContext(SettingsSyncContext);
  if (!context) {
    throw new Error('useSettingsSync must be used within a SettingsSyncProvider');
  }
  return context;
}

/** True once the settings GET has settled (any outcome): contexts hold their final values. */
export function useSettingsHydrated(): boolean {
  return useSettingsSync().load !== null;
}

/** Server writes coalesce per key: the coach card calls setSettings on every keystroke. */
const WRITE_DEBOUNCE_MS = 800;

interface ServerBackedOptions<T> {
  key: Exclude<SettingKey, 'coachThread'>;
  /** The context's current (local) value. */
  value: T;
  /** The part of the value the server stores (profile drops bodyweight). */
  toServer: (value: T) => unknown;
  /** Untouched defaults are not worth uploading on first sync. */
  isDefault: (value: T) => boolean;
  /** Take a server value into the context + localStorage; returns what was applied. */
  applyServer: (serverValue: unknown) => T;
}

/**
 * Last-write-wins sync for one settings context: reconcile once when the GET settles, then
 * write through (debounced) on every change. A failed write is not retried here; the next
 * page load finds local ≠ last-synced and uploads it.
 */
export function useServerBacked<T>({ key, value, toServer, isDefault, applyServer }: ServerBackedOptions<T>) {
  const { load } = useSettingsSync();
  const latest = useRef({ value, toServer, isDefault, applyServer });
  latest.current = { value, toServer, isDefault, applyServer };
  const reconciled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValue = useRef<T | null>(null);

  const push = useCallback(
    (next: T, baseUpdatedAt?: string | null) => {
      const serverValue = latest.current.toServer(next);
      void putSetting(key, serverValue, baseUpdatedAt).then((result) => {
        if (result.ok) writeSynced(key, { updatedAt: result.entry.updatedAt, json: stableJson(serverValue) });
      });
    },
    [key]
  );

  // Layout effect: applied before paint, so nothing renders the pre-hydration value after
  // `load` flips (the coach page waits on `load`).
  useLayoutEffect(() => {
    if (!load || reconciled.current) return;
    reconciled.current = true;
    if (!load.available) return;
    const { value: local, toServer: ts, isDefault: def, applyServer: apply } = latest.current;
    const action = reconcile({
      server: load.settings[key] ?? null,
      localJson: stableJson(ts(local)),
      localIsDefault: def(local),
      synced: readSynced(key),
    });
    if (action.type === 'apply') {
      const applied = apply(action.entry.value);
      writeSynced(key, { updatedAt: action.entry.updatedAt, json: stableJson(ts(applied)) });
    } else if (action.type === 'upload') {
      push(local);
    }
  }, [load, key, push]);

  const flush = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    if (pendingValue.current !== null) push(pendingValue.current);
    pendingValue.current = null;
  }, [push]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  /** Call after every local change. Before the GET settles, reconcile picks the change up. */
  const changed = useCallback(
    (next: T) => {
      if (!load?.available) return;
      pendingValue.current = next;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, WRITE_DEBOUNCE_MS);
    },
    [load, flush]
  );

  return { changed };
}
