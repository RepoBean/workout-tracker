# v3 Bundle B3 — Load the Android UI from the server

Status: built 2026-10-03, **device test pending** (Claude can't run the APK).

## Why
The APK bundled the frontend, so every UI change meant a release and a reinstall on both
phones. Both phones are always on the VPN, so bundling bought nothing. Now the APK is a
shell: it loads the UI from the phone's own server, `ship.sh <inst>` updates that phone, and
each phone runs its own instance's version (wife-lags-main holds with no extra step). APK
releases are for native changes only (plugins, permissions, icon, the shell itself).

## Decisions (Jason, 2026-10-03)
- **One APK; the server is a setting.** Not two baked flavours. Phones use
  `https://gym.bootyhole23.com` (main) and `https://gym-e.bootyhole23.com` (wife) — both https
  behind openresty, so the served page is a secure context (the old "insecure context" item
  is moot).
- **Settings re-entered once per phone**, no migration. localStorage is per origin, so the
  move from `https://localhost` to the domain starts profile, bodyweight, progression,
  coach key + thread and theme empty. Only the server address carries over (see hand-off).

## How it works
- **Native (`MainActivity.java`).** The server origin lives in SharedPreferences
  (`workout_shell` / `server_url`). At startup, if one is saved, the activity copies the
  bundled `capacitor.config.json`, sets `server.url` to it and `server.errorPath` to
  `offline.html`, and starts Capacitor with that config. **This must be `server.url`**:
  Capacitor injects its plugin bridge (document-start script) only into the origin it was
  started with, so a bundled launcher that merely navigated to the server would lose BLE,
  notifications and the foreground service. With nothing saved, the bundled UI loads as before.
- **`window.WorkoutShell` (`ShellInterface.java`, version 1)**: `getServerUrl`,
  `setServerUrl`, `clearServerUrl`, `restart` (recreates the activity), `openExternal`,
  `getVersion`. A plain `addJavascriptInterface`, attached before the first `loadUrl`, so
  it is also there on the bundled error page (which has no Capacitor bridge). The JS side
  (`shared/lib/shell.ts`) feature-checks it; an older APK simply has none.
- **Hand-off (`main.tsx`).** First launch of the new APK runs the bundled UI, which already
  has the server address its API calls use (`wt:api-base-url`). It saves that as the shell
  server and restarts once — the phone moves to the served UI with no tapping.
- **Settings → Server.** Served by the shell, the card shows where the app loads from, with
  *Switch server* and *Use built-in app* (both restart, both `confirm()`). Otherwise it is the
  old API-address card; saving it in a new shell also hands off.
- **`offline.html`** (bundled): shown when the server can't be reached or answers an error
  for the page itself. Try again / Change server / Use built-in app.
- **Downloads** (CSV, program export): served from the server, a download URL is same-host
  and `window.open` would stay in the WebView (which can't save files), so
  `openServerDownload` uses `WorkoutShell.openExternal` to hand it to the system browser.

## Rules from here on
- **A server must run a B3-aware build before its phone installs a B3 APK.** An older served
  UI doesn't know the shell and shows the "Connect to your server" gate.
- **Plugin or shell changes still need an APK release first**; served code must feature-check
  anything native it calls (`getShell()`, `WorkoutShell.getVersion()`).
- Never switch servers mid-workout: in-progress session keys are per origin.

## Device test (Pixel) — Jason
Install the test APK over the current app (same signing key, so it upgrades in place).
1. [ ] App opens, restarts once by itself, and lands on Home with your data
       (Settings → Android → diagnostics shows `UI loaded from: https://gym.bootyhole23.com (shell v1)`).
2. [ ] Re-enter profile (DOB, sex, HR, bodyweight), progression settings, coach key.
3. [ ] Heart-rate strap connects (Bluetooth permission prompt may reappear) and shows BPM.
4. [ ] Rest timer: start one, lock the phone, the notification fires on time.
5. [ ] Start a workout with the strap connected: the foreground notification appears;
       tapping it opens the workout. Discard the test workout after.
6. [ ] Back button: goes back inside the app; on Home it exits.
7. [ ] History → Export CSV and a program export open in the browser and download.
8. [ ] VPN off → reopen the app: the "Can't reach your server" page; VPN on → Try again works.
9. [ ] Settings → Server shows the domain; *Use built-in app* restarts into the bundled UI;
       Settings → Server → Save the domain again → restarts back onto the server.

## Results
_(fill in after the device test)_
