import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsSync } from '../../../shared/context/SettingsSyncContext';
import {
  LoadResult,
  ServerEntry,
  putSetting,
  readSynced,
  reconcile,
  refetchServerSettings,
  stableJson,
  writeSynced,
} from '../../../shared/lib/settingsSync';
import { DisplayMessage, normalizeThread, saveThread, storedThread } from '../lib/thread';

/**
 * The coach thread on the server (v4 C2). Unlike the other settings it is not last-write-
 * wins: two devices append to one chat, so every PUT carries the updatedAt it last saw and
 * a mismatch (409) means the other device got there first. Then the server's thread
 * replaces ours and the exchange that lost is dropped (C2 D3); `onConflict` tells the user.
 *
 * Writes happen only when an exchange settles (`busy` false), so a send's two thread
 * changes are one PUT and never race their own updatedAt. The thread loads fresh when the
 * page mounts (the page-load GET may be old by then) and again on page focus.
 *
 * Returns `ready`: the server has answered (or is unavailable), so a send will be synced.
 */
export function useThreadSync({
  thread,
  setThread,
  busy,
  onConflict,
}: {
  thread: DisplayMessage[];
  setThread: (thread: DisplayMessage[]) => void;
  busy: boolean;
  onConflict: () => void;
}) {
  const { load } = useSettingsSync();
  // The server row's updatedAt we last agreed with: null = no row, undefined = not synced
  // (server unavailable, or the GET hasn't settled).
  const base = useRef<string | null | undefined>(undefined);
  // JSON of the thread as last agreed with the server.
  const agreedJson = useRef<string>(stableJson([]));
  const inFlight = useRef(false);
  const latest = useRef({ thread, busy, setThread, onConflict });
  latest.current = { thread, busy, setThread, onConflict };

  const agree = (entry: ServerEntry, json: string) => {
    base.current = entry.updatedAt;
    agreedJson.current = json;
    writeSynced('coachThread', { updatedAt: entry.updatedAt, json });
  };

  const applyEntry = useCallback((entry: ServerEntry | null) => {
    const value = entry ? normalizeThread(entry.value) : [];
    latest.current.setThread(value);
    saveThread(value);
    if (entry) agree(entry, stableJson(value));
    else {
      base.current = null;
      agreedJson.current = stableJson([]);
    }
  }, []);

  const push = useCallback(async () => {
    if (inFlight.current || base.current === undefined) return;
    const value = storedThread(latest.current.thread);
    const json = stableJson(value);
    if (json === agreedJson.current) return;
    inFlight.current = true;
    const result = await putSetting('coachThread', value, base.current);
    inFlight.current = false;
    if (result.ok) {
      agree(result.entry, json);
      // The thread may have moved on while the PUT was out.
      if (!latest.current.busy) void push();
    } else if ('conflict' in result) {
      applyEntry(result.conflict);
      latest.current.onConflict();
    }
    // Unavailable: leave it; the next load finds local ≠ last-synced and uploads.
  }, [applyEntry]);

  const syncFrom = useCallback((result: LoadResult) => {
    if (!result.available || inFlight.current || latest.current.busy) return;
    const entry = result.settings.coachThread ?? null;
    const local = storedThread(latest.current.thread);
    const action = reconcile({
      server: entry,
      localJson: stableJson(local),
      localIsDefault: local.length === 0,
      synced: readSynced('coachThread'),
    });
    if (action.type === 'apply') {
      applyEntry(action.entry);
      return;
    }
    if (entry) {
      base.current = entry.updatedAt;
      agreedJson.current = stableJson(normalizeThread(entry.value));
    } else {
      base.current = null;
      agreedJson.current = stableJson([]);
    }
    if (action.type === 'upload') void push();
  }, [applyEntry, push]);

  const [ready, setReady] = useState(false);

  // Once the page-load GET says the server has settings at all, fetch the thread fresh.
  const started = useRef(false);
  useEffect(() => {
    if (!load || started.current) return;
    started.current = true;
    if (!load.available) {
      setReady(true);
      return;
    }
    void refetchServerSettings().then((result) => {
      syncFrom(result);
      setReady(true);
    });
  }, [load, syncFrom]);

  // Write when an exchange settles, and on New Chat (thread → []).
  useEffect(() => {
    if (!busy) void push();
  }, [thread, busy, push]);

  // The other device may have talked to the coach since: reload on focus.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || base.current === undefined) return;
      void refetchServerSettings().then(syncFrom);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [syncFrom]);

  return { ready };
}
