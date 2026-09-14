# Bundle B0 — Capacitor spike: agent brief + plan

**Status:** brief written 2026-09-14. Not started.
**Executing agent:** Google Antigravity (Gemini Flash 3.8), not Claude Code.
**Device verification:** Jason, on his Pixel. The agent can build the APK but cannot run it.
**Parent plan:** `docs/v3-plan.md` §5 (Track B). Bundle 1 results for the ship-loop pattern: `docs/v3-bundle-1-drizzle.md`.

This file has four parts: (0) the kickoff prompt to paste into the agent, (1) ground truth
about the repo, (2) the phased work plan with acceptance checks, (3) Jason's on-device
checklist, (4) a results section the agent fills in.

---

## 0. Kickoff prompt (paste this into Antigravity verbatim)

```text
You are working in the git repo at /opt/docker/workout-tracker (branch: main, clean).
It is a self-hosted personal workout tracker: React 19 + Vite 6 + TypeScript frontend in
frontend/, Express + Drizzle backend in backend/, SQLite, deployed as Docker images.

Your job is Bundle B0, a Capacitor spike that wraps the EXISTING React build in an Android
app to prove two things the browser cannot do: (1) a Bluetooth heart-rate strap stays
connected with the screen off, (2) the rest timer fires a notification with the screen off.

Before writing any code, read these files completely, in this order:
  1. CLAUDE.md                              (project rules; the "Sacred Rules" table is non-negotiable)
  2. docs/v3-bundle-b0-capacitor.md         (THIS spike: rules, phases, acceptance checks, interfaces)
  3. docs/v3-plan.md sections 3 and 5       (why native; what B0/B1/B2 are)
  4. frontend/src/shared/context/HeartRateContext.tsx
  5. frontend/src/shared/context/TimerContext.tsx
  6. frontend/src/shared/api/client.ts
  7. frontend/src/main.tsx, frontend/src/App.tsx, frontend/index.html

Then follow docs/v3-bundle-b0-capacitor.md Part 2 phase by phase. Each phase ends with a
commit on the branch b0-capacitor-spike and the acceptance checks listed for that phase
passing. Do not start a phase until the previous phase's checks pass.

Hard rules (details in the doc, Part 1.3):
  - Work on branch b0-capacitor-spike. Never commit to main. Never push.
  - Never run scripts/ship.sh, scripts/restore.sh, docker compose up/down, or anything that
    touches the running containers or the docker volumes. The volumes are the real data.
  - The web app must behave exactly as before. Existing tests must pass unchanged
    (frontend: 106 tests, backend suite). `tsc --noEmit` and `vite build` must stay clean.
  - The only backend change allowed is the CORS origin list in backend/src/index.ts.
  - No schema changes, no new state library, no service worker, no dependency upgrades of
    React/Vite/TypeScript. Do not reformat files you did not otherwise change.
  - Files stay under 500 lines. No `any`.
  - When you hit an unknown you cannot resolve from docs or code, write it under
    "Open questions" in Part 4 of the doc and continue with the next independent step.
    Do not invent Android behavior; if you are unsure whether something works on-device,
    say so in the doc and make it observable in the diagnostics panel (Phase 6).

Environment: Node 22 via nvm (`source ~/.nvm/nvm.sh && nvm use` from the repo root; a
.nvmrc exists). Docker is available. There is NO Java/JDK/Android SDK on the host; the APK
is built inside a Docker image you create (Phase 3). Run npm commands from frontend/ or
backend/ respectively.

Finish by filling Part 4 (Results) of docs/v3-bundle-b0-capacitor.md: exact package
versions, what you built, what you could not verify, open questions, and the command
Jason runs to get the APK onto his phone. Then stop and report.
```

---

## 1. Ground truth

### 1.1 The gym problem (why native, do not re-litigate)

- Web Bluetooth drops when Chrome is backgrounded or the screen turns off. Service workers
  have no Bluetooth access. Only a native **foreground service** keeps the strap connected.
- Browsers cannot schedule a notification for a future time. The reliable rest-timer alert
  is a native **local notification** scheduled at timer start.
- Capacitor = the same Vite build in a WebView + native plugins. ~95% code reuse. The APK is
  sideloaded over the VPN. No Play Store, no iOS (both phones are Pixels).

### 1.2 Where things are

| What | Where | Notes |
|---|---|---|
| HR strap | `frontend/src/shared/context/HeartRateContext.tsx` | Web Bluetooth today. Public API (`HeartRateContextType`) must not change; 7 consumers. |
| Rest timer | `frontend/src/shared/context/TimerContext.tsx` | `startTimer/stopTimer/extendTimer/skipTimer`; persists `endTime` in localStorage key `workout-tracker-timer`. Web `Notification` is wrapped in try/catch because Android Chrome throws. |
| API client | `frontend/src/shared/api/client.ts` | axios, `baseURL: '/api'` (relative; nginx proxies to the backend). |
| Backend CORS | `backend/src/index.ts` lines ~19-22 | `cors({ origin: ['http://localhost:5174','http://127.0.0.1:5174'] })`. In production nginx makes `/api` same-origin, so CORS is never exercised on the web. |
| Health check | `GET /api/health` | `{ status: 'ok', timestamp }`. Use it for "Test connection". |
| Fonts | `frontend/index.html` lines 9-11 | Google Fonts: DM Sans 700/800 (`font-display`), Outfit 400/500/600 (`font-sans`). Family names in `frontend/tailwind.config.js`. |
| Providers | `frontend/src/main.tsx` | Provider stack. Routes + tab bar in `App.tsx` (`BrowserRouter`). |
| Session page | `frontend/src/features/active-session/index.tsx` | Route `/workout/:id`. Knows `sessionId`, whether the session is completed, and `showCelebration`. |
| Session lifecycle | `hooks/useStartSession.ts`, `hooks/useActiveSession.ts` (complete, ~line 324), `hooks/useDiscardSession.ts` | Start / complete / discard. |
| Active-session query | `shared/api/queries.ts` `queryKeys.activeSession` | `GET /api/sessions/active` returns the in-progress session or null. |
| Settings page | `frontend/src/features/settings/index.tsx` | Cards: profile, auto-progression, AI coach. Add new cards here. |
| Frontend tests | `cd frontend && npx vitest run` | 106 passing on 2026-09-14. jsdom. |
| Backend tests | `cd backend && npm test` | vitest + supertest over in-memory SQLite. |
| Typecheck | `cd frontend && npx tsc -b` (build does `tsc -b && vite build`) | `tsconfig.json` includes only `src/`, so `frontend/android/` is never typechecked. |
| Instances | main 8035, wife 8036, staging **8037** | The APK talks to **staging** during the spike. URL is `http://<server-vpn-ip>:8037` (Jason knows the IP; it becomes a runtime setting, Phase 1). |

### 1.3 Hard rules

1. Branch `b0-capacitor-spike`; never commit to `main`; never push.
2. Never run `scripts/ship.sh`, `scripts/restore.sh`, `scripts/seed-staging.sh`,
   `docker compose up|down|rm`. Never touch `/var/lib/docker` or any volume. Docker may
   only be used to **build the APK** (Phase 3) with a throwaway image and its own volumes.
3. Web behavior is frozen: same UI, same network calls, same bundle chunks except for the
   small additions below. All existing tests pass unchanged; new tests are additive.
4. Backend: only the CORS origin list may change (Phase 1.4), plus one test for it.
5. Follow CLAUDE.md conventions: TanStack Query + Context only, mobile-first Tailwind,
   `surface-*` dark tokens, `useToast` (never `alert`), `confirm()` for destructive actions,
   feature folders `kebab-case`, files < 500 lines, no `any`.
6. Native code is gated at **runtime** by one helper (`isNativeApp()`, Phase 1.1), and
   native plugins are loaded with **dynamic `import()`** so the web bundle never ships
   Bluetooth/notification/foreground-service plugin code.
7. Commit `frontend/android/` (Capacitor's generated `.gitignore` excludes build output).
   Never commit `local.properties`, keystores, or `*.apk`.
8. Do not tick the B0 checkboxes in `docs/v3-plan.md` that need on-device verification.
   Jason ticks those. You may tick "cap add", "transport interface", "fonts", "API base URL",
   "build" once their acceptance checks pass.

### 1.4 Versions (verified on npm 2026-09-14)

| Package | Version | Role |
|---|---|---|
| `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` | 8.5.2 | runtime + CLI + Android platform |
| `@capacitor/app` | 8.1.1 | app state, back button |
| `@capacitor/local-notifications` | 8.3.1 | rest-timer notification |
| `@capacitor-community/bluetooth-le` | 8.3.0 | native BLE (peer `@capacitor/core >=8`) |
| `@capawesome-team/capacitor-android-foreground-service` | 8.1.0 | foreground service (note the `-team` scope; `docs/v3-plan.md` had the wrong name) |
| `@fontsource/dm-sans`, `@fontsource/outfit` | 5.3.0 | bundled fonts |

Pin exact versions (no `^`) for the Capacitor packages so the four stay in lockstep.
Read each plugin's README for its **AndroidManifest permissions** and Android 14/15
requirements before using it; do not guess permission names.

---

## 2. Work plan

Phases are ordered so that the app is installable and talking to staging **before** any
Bluetooth or notification work starts (Phase 3 is the first APK). Each phase = one commit.

### Phase 0 — Baseline

1. `git checkout -b b0-capacitor-spike`.
2. Run and record the baseline: `cd frontend && npx tsc -b && npx vitest run && npm run build`;
   `cd backend && npm test`. Note test counts and the sizes of the main JS chunks from the
   `vite build` output in Part 4 (you will compare after Phase 2 and Phase 4).

**Accept:** everything green; numbers recorded.

### Phase 1 — Platform gate, API base URL setting, CORS

1.1 **`frontend/src/shared/lib/platform.ts`**
```ts
import { Capacitor } from '@capacitor/core';
/** True inside the Android app; false in any browser (incl. jsdom tests). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
```
Install `@capacitor/core` + `@capacitor/cli` (exact versions) in `frontend/` to make this
compile. `isNativePlatform()` returns false in jsdom, so no test mocks are needed.

1.2 **`frontend/src/shared/api/baseUrl.ts`** — localStorage key `wt:api-base-url`.
`getApiBaseUrl(): string` returns the stored origin with whitespace and trailing `/`
stripped, or `''`. `setApiBaseUrl(url: string)`. `''` means "same origin as the page"
(today's behavior). Add a pure `normalizeApiBaseUrl` with a small vitest file (`' http://x/ '`
→ `'http://x'`, `''` → `''`, `'x'` without scheme → `'http://x'`).

1.3 **`client.ts`** — add a request interceptor that sets
`config.baseURL = getApiBaseUrl() + '/api'`. Keep `baseURL: '/api'` as the default. The
other file that hits the API directly (`AdHocWorkoutPicker.tsx` uses `api.post`) goes
through the same instance, so nothing else changes.

1.4 **Backend CORS** (`backend/src/index.ts`): origin list becomes
`process.env.CORS_ORIGINS?.split(',')` when set, else the two dev origins plus
`https://localhost` and `http://localhost` (the Capacitor Android WebView origin; Capacitor 8
defaults to the `https` scheme). Add one supertest case in `backend/test/` asserting
`access-control-allow-origin: https://localhost` on a request with that `Origin` header.
Add `CORS_ORIGINS` to nothing else — the default list is enough for the spike.

1.5 **Settings "Server" card** (`frontend/src/features/settings/components/ServerCard.tsx`):
a URL input prefilled from `getApiBaseUrl()`, Save, and "Test connection" (GET `/api/health`
through the axios instance; `toast.success` on 200, `toast.error` otherwise). After Save call
`queryClient.invalidateQueries()` (everything) so the app refetches from the new server.
Render it on the Settings page always (harmless on web: blank = this site), with helper text
"Leave blank to use this site. In the Android app, enter the server address, e.g.
http://10.x.x.x:8037".

1.6 **First-run gate on native**: in `App.tsx`, if `isNativeApp()` and `getApiBaseUrl()`
is `''`, render a minimal setup screen that embeds `ServerCard` instead of the router. On
save it re-renders into the app. Web path untouched (keep the gate as one early `return`
so the diff is small).

**Accept:** frontend tests (incl. the new one) + backend tests green; `tsc -b` clean; on the
web (`npm run dev`) the Settings page shows the card and "Test connection" succeeds against
the dev backend; a request with `Origin: https://localhost` to the backend gets the CORS
header (curl it against `npm run dev` on 3002).

### Phase 2 — Bundle fonts locally

Install `@fontsource/dm-sans` and `@fontsource/outfit`. In `main.tsx` import
`@fontsource/dm-sans/700.css`, `@fontsource/dm-sans/800.css`, `@fontsource/outfit/400.css`,
`@fontsource/outfit/500.css`, `@fontsource/outfit/600.css`. Delete the three
`fonts.googleapis`/`gstatic` `<link>` tags from `index.html`. Family names stay `'DM Sans'`
and `'Outfit'` so `tailwind.config.js` is untouched.

**Accept:** `npm run build` then `grep -r "googleapis" frontend/dist` returns nothing and
`ls frontend/dist/assets/*.woff2` shows the font files. Visually check in the browser that
headings are still DM Sans (Chrome devtools → Computed → Rendered Fonts).

### Phase 3 — Capacitor scaffold + reproducible APK build (first installable app)

3.1 In `frontend/`: install `@capacitor/android` (exact), then `npx cap init "Workout Tracker"
dev.repobean.workouttracker --web-dir dist` and `npx cap add android`. `capacitor.config.ts`:
```ts
import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'dev.repobean.workouttracker',
  appName: 'Workout Tracker',
  webDir: 'dist',
  server: { cleartext: true },          // API is plain http over the VPN
  android: { allowMixedContent: true }, // https://localhost WebView → http:// API
};
export default config;
```
Set `android:usesCleartextTraffic="true"` on `<application>` in `AndroidManifest.xml` if
`cap add` did not (check; `server.cleartext` should do it).

3.2 **`Dockerfile.android`** at the repo root: `eclipse-temurin:21-jdk` + Android
command-line tools + `platform-tools` + the exact `platforms;android-XX` and
`build-tools;XX.0.0` that `frontend/android/variables.gradle` names (read that file after
`cap add`; do not hardcode from memory). Accept licenses non-interactively.

3.3 **`scripts/build-apk.sh`** (bash, `set -euo pipefail`, runs from repo root):
1. `source ~/.nvm/nvm.sh && nvm use` (same guard as `scripts/ship.sh`),
2. `cd frontend && npm run build && npx cap sync android` (no JDK needed for sync),
3. `docker build -f Dockerfile.android -t workout-tracker-android .` (cached after the first run),
4. `docker run --rm --user "$(id -u):$(id -g)" -e HOME=/home/builder -e GRADLE_USER_HOME=/home/builder/.gradle
   -v workout-tracker-android-home:/home/builder -v "$PWD/frontend/android:/project" -w /project
   workout-tracker-android ./gradlew assembleDebug --no-daemon`,
5. copy `frontend/android/app/build/outputs/apk/debug/app-debug.apk` to
   `~/apk/workout-tracker-$(git rev-parse --short HEAD)-debug.apk` and `~/apk/latest.apk`, print both paths.

The named volume at `$HOME` is load-bearing: it persists the Gradle cache **and** the auto-generated
debug keystore (`~/.android/debug.keystore`). Without it every build gets a new signing key and
Android refuses to install the update over the old one. The `--user` flag keeps
`frontend/android/build` owned by Jason, not root. Make the volume's mount point writable by that
uid (create the dir in the Dockerfile with `chmod 777`, or `chown` at first run).

3.4 **`scripts/serve-apk.sh`**: prints `http://$(hostname -I | awk '{print $1}'):8038/latest.apk`
and runs `python3 -m http.server 8038 --bind 0.0.0.0 --directory ~/apk`. Foreground, Ctrl-C to
stop. (The host has python3; no jq, no Java.)

3.5 Add `frontend/android/` to git except what Capacitor's generated `android/.gitignore`
excludes. Add `*.apk` and `frontend/android/local.properties` to the root `.gitignore`.

**Accept:** `scripts/build-apk.sh` finishes and prints an APK path. Run it **twice**; the
second run must reuse the Gradle cache (well under 2 min) and produce an APK signed by the same
key (`unzip -p latest.apk META-INF/*.RSA | keytool -printcert` fingerprint identical, or
`apksigner verify --print-certs` inside the container). Web tests + build still green.
**Milestone: hand this APK to Jason** (Part 3, checks D1-D3) before starting Phase 4 — it proves
the WebView, routing, fonts and the staging connection. Jason needs to run
`scripts/ship.sh staging` from this branch first so staging's backend has the CORS change.

### Phase 4 — HR transport interface + native BLE

4.1 **`frontend/src/shared/lib/hrTransport/types.ts`**
```ts
export interface HrHandlers {
  onBpm(bpm: number): void;        // one validated reading (1..250)
  onDisconnected(): void;          // link dropped, not user-initiated
}
export interface HrDeviceInfo { name: string }
export interface HrTransport {
  readonly kind: 'web-bluetooth' | 'native-ble';
  /** Show the OS/browser chooser, connect, subscribe to HR notifications. */
  connect(h: HrHandlers): Promise<HrDeviceInfo>;
  /** Silent reconnect to a previously used strap; null if none or it failed. */
  reconnect(h: HrHandlers): Promise<HrDeviceInfo | null>;
  disconnect(): Promise<void>;
}
```
4.2 **`hrTransport/parseHr.ts`** — move the existing `parseHr(DataView)` here unchanged and
add a vitest file (8-bit and 16-bit flag cases). The 1..250 validity check moves next to it
(`isPlausibleBpm`).

4.3 **`hrTransport/webBluetooth.ts`** — the current context code, moved: `requestDevice` with
the `heart_rate` service filter, `gattserverdisconnected` listener, `getDevices()` reconnect.
Same behavior, same filters. `kind: 'web-bluetooth'`.

4.4 **`hrTransport/nativeBle.ts`** — `@capacitor-community/bluetooth-le`:
`BleClient.initialize({ androidNeverForLocation: true })`; `requestDevice({ services: [HR_SERVICE] })`
with the 128-bit UUIDs (`0000180d-0000-1000-8000-00805f9b34fb`, measurement
`00002a37-0000-1000-8000-00805f9b34fb`); `connect(deviceId, onDisconnect)`;
`startNotifications(deviceId, HR_SERVICE, HR_MEASUREMENT, (dv) => …parseHr…)`. Remember
`{ deviceId, name }` in localStorage `wt:hr-native-device` so `reconnect()` can call
`connect()` directly without the chooser. `disconnect()` → `stopNotifications` + `disconnect`.
`kind: 'native-ble'`.

4.5 **`hrTransport/index.ts`** — `getHrTransport(): Promise<HrTransport>`: on
`isNativeApp()` do `await import('./nativeBle')`, else `await import('./webBluetooth')`.
Memoize the promise. Also export `isHrSupported()`:
`isNativeApp() || (typeof navigator !== 'undefined' && 'bluetooth' in navigator)`.

4.6 **`HeartRateContext.tsx`** — replace `deviceRef`/`characteristicRef`/`subscribeToDevice`/
`cleanupListeners` with one `transportRef`. `connect()` → `transport.connect({ onBpm: pushSample,
onDisconnected })`; the mount effect → `transport.reconnect(...)`; `disconnect()` →
`transport.disconnect()`. `pushSample` keeps the buffer, retention, `restoreSamples`,
`statsSince`, `samplesSince` exactly as they are. **`HeartRateContextType` does not change.**
Keep the "cancelled" chooser error swallow. Keep the `useMemo` value.

4.7 **AndroidManifest** — the permissions the plugin README lists for Android 12+
(`BLUETOOTH_SCAN` with `neverForLocation`, `BLUETOOTH_CONNECT`). No location permission.

**Accept:** all frontend tests + the new `parseHr` tests green; `tsc -b` clean; `npm run build`
and confirm `bluetooth-le` appears only in its own lazy chunk (search
`frontend/dist/assets/*.js` for `startNotifications`; it must not be in the entry chunk). On
the web (`npm run dev`, Chrome, a real strap if available or at least the chooser) connect
still works and the pill shows BPM. Then `scripts/build-apk.sh`.

### Phase 5 — Rest-timer notification on native

5.1 **`frontend/src/shared/lib/restNotification.ts`** — `scheduleRestNotification(endTimeMs: number)`
and `cancelRestNotification()`. On web both are no-ops. On native (dynamic import of
`@capacitor/local-notifications`): a fixed `id: 1001`, title "Rest complete", body "Time for your
next set", `schedule: { at: new Date(endTimeMs), allowWhileIdle: true }`, on a channel
`rest-timer` created once with importance HIGH + vibration (so it heads-up with the screen off).
Also `ensureNotificationPermission(): Promise<boolean>` → `requestPermissions()` on native.

5.2 **`TimerContext.tsx`** — call `scheduleRestNotification(endTime)` in `startTimer`, cancel +
reschedule in `extendTimer`, cancel in `stopTimer` / `skipTimer` and in the tick's completion
branch (a foreground completion already beeps and vibrates; cancelling avoids a late duplicate).
On native, `startTimer` calls `ensureNotificationPermission()` instead of the web
`Notification.requestPermission()`. Keep the web branch byte-for-byte.

5.3 **Android 14+ exact alarms**: after `requestPermissions`, call
`checkExactNotificationSetting()`; if not `granted`, the Settings "Android" card (Phase 6) shows
an "Allow exact timer alarms" button that calls `changeExactNotificationSetting()`. Do not block
`startTimer` on it; `allowWhileIdle` still fires within Doze windows if exact is denied. Log the
state in diagnostics.

5.4 Manifest permissions per the plugin README (`POST_NOTIFICATIONS`, exact-alarm permission
as documented for the plugin version you installed).

**Accept:** tests + tsc + build green; the web timer is unchanged (start a rest in the browser,
it still beeps). `scripts/build-apk.sh`.

### Phase 6 — Foreground service + diagnostics panel

6.1 **`frontend/src/shared/lib/foregroundService.ts`** — `startWorkoutService()` /
`stopWorkoutService()`; no-ops on web. Native: `@capawesome-team/capacitor-android-foreground-service`
`startForegroundService({ id: 1, title: 'Workout in progress', body: 'Heart rate and rest timer stay active',
smallIcon: 'ic_stat_workout', ... })` plus whatever the README requires for Android 14's
**foreground service type** (the app holds a BLE connection, so `connectedDevice`; the manifest
needs `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_CONNECTED_DEVICE`). Add a monochrome
`ic_stat_workout` drawable (a simple white dumbbell or circle on transparent) under
`android/app/src/main/res/drawable*/`. Call `requestPermissions()` if the plugin needs it for the
persistent notification. Idempotent: calling start twice must not create two notifications.

6.2 **`features/active-session/hooks/useWorkoutForegroundService.ts`** — `(active: boolean)`:
effect that starts when `active` turns true and stops when it turns false or on unmount. Wire it
in `active-session/index.tsx` with `active = isNativeApp() && session loaded && !completed &&
!showCelebration`. Also stop it inside `useDiscardSession`'s success path and after complete.
(B1 will bind this to the server-side active session; for the spike, "session page open" is the
lifecycle.)

6.3 **`@capacitor/app`** — in `App.tsx`, on native only: `backButton` listener → if the path is
`/`, `App.minimizeApp()`, else `history.back()`. Nothing else.

6.4 **Settings "Android" card** (`features/settings/components/AndroidCard.tsx`, rendered only
when `isNativeApp()`): buttons "Notification permission", "Allow exact timer alarms", a hint to
set the app's battery usage to **Unrestricted** (deep link with `App` is optional; text is fine),
and a **Diagnostics** block: platform, API base URL, HR transport kind, connected + device name,
samples in the last 60 s, seconds since the last sample, **largest gap (s) between consecutive
samples in the last 15 min** (from `samplesSince(Date.now() - 15*60*1000)`), whether the
foreground service is running (track in a module-level flag), last scheduled notification time,
exact-alarm state. A "Copy diagnostics" button that writes the block as text to the clipboard.
Refresh every 2 s while the card is visible. This panel is how Jason reports results without adb;
make every claim in Part 3 observable here.

**Accept:** tests + tsc + build green; web untouched; `scripts/build-apk.sh` succeeds. Ship the
APK path to Jason with the Part 3 checklist.

### Phase 7 — Docs

- Fill Part 4 below. Add a row to the CLAUDE.md Changelog and a `frontend/android/` +
  `Dockerfile.android` + two scripts mention in CLAUDE.md's "Development Setup" (one short
  paragraph: "Android app (spike)").
- In `docs/v3-plan.md` §B0 tick only the boxes whose acceptance checks you ran yourself.
- Squash nothing; leave the phase commits.

---

## 3. Jason's on-device checklist (results go in Part 4)

Prep once: on the Pixel, allow installs from Chrome; after the first install, set the app's
battery usage to **Unrestricted** (Settings → Apps → Workout Tracker → Battery). Enter the staging
URL on the first-run screen. Chrome's pairing does not carry over; pair the strap again inside the app.

| # | Check | Pass looks like |
|---|---|---|
| D1 | Install `latest.apk`, open | Dashboard renders with staging data; fonts look like the web app |
| D2 | Settings → Server → Test connection | Green toast |
| D3 | Navigate Home → Programs → History → open a session → reload via error-fallback "Reload" if reachable, else kill and reopen | No white screen; routes survive a cold start |
| D4 | Start a workout, connect the strap in the header pill | BPM updates every second; diagnostics shows transport `native-ble` |
| D5 | Screen off for **10 min** mid-workout (phone in pocket) | On wake: pill still shows BPM, diagnostics "largest gap" < 15 s, foreground notification was visible the whole time |
| D6 | Start a 90 s rest timer, screen off immediately | Notification + vibration at ~90 s with the screen still off |
| D7 | Start a rest timer, skip it | No notification fires later |
| D8 | Extend a rest timer by 30 s, screen off | Fires at the extended time, once |
| D9 | Complete the workout | Foreground notification disappears; session shows HR avg/min/max and a chart in History |
| D10 | Rebuild + reinstall a later APK over this one | Installs without "app not installed" (same debug key) |

D5 and D6 are the spike. Everything else is scaffolding. If D5 fails with samples resuming on wake
(large gap, then BPM again), the WebView was suspended while the native link stayed up; that is a
**finding**, not a bug in the agent's work, and the answer is native-side buffering in B1.

---

## 4. Results (agent fills in; Jason appends device results)

### 4.1 Versions installed
- `@capacitor/core`: `8.1.1`
- `@capacitor/android`: `8.5.2`
- `@capacitor/app`: `8.1.1`
- `@capacitor-community/bluetooth-le`: `8.3.0`
- `@capacitor/local-notifications`: `8.3.1`
- `@capawesome-team/capacitor-android-foreground-service`: `8.1.0`
- `@fontsource/dm-sans`: `5.3.0`
- `@fontsource/outfit`: `5.3.0`
- Android build variables (`frontend/android/variables.gradle`):
  - `minSdkVersion = 24`
  - `compileSdkVersion = 36`
  - `targetSdkVersion = 36`
  - `androidxActivityVersion = '1.10.1'`
  - `androidxAppCompatVersion = '1.7.0'`
  - `androidxCoordinatorLayoutVersion = '1.3.0'`
  - `androidxCoreVersion = '1.16.0'`
  - `androidxFragmentVersion = '1.8.6'`
  - `coreSplashScreenVersion = '1.0.1'`
  - `androidxEspressoCoreVersion = '3.6.1'`
  - `androidxJunitVersion = '1.2.1'`
  - `junitVersion = '4.13.2'`
  - Android build-tools: `36.0.0`
- Docker JDK image tag: `eclipse-temurin:21-jdk`

### 4.2 Baseline vs after
| Metric | Before | After |
|---|---|---|
| Frontend tests | 106 (10 test files) | 118 (12 test files: +7 baseUrl, +5 parseHr) |
| Backend tests | 71 (7 test files) | 74 (8 test files: +3 cors) |
| Entry chunk (kB / gzip) | 301.85 kB / 95.43 kB | 352.11 kB / 114.66 kB (growth from local font woff2 loader imports; all native plugins stay in lazy chunks) |
| New lazy chunks | — | `nativeBle` (11.00 kB), `webBluetooth` (2.52 kB), `local-notifications` (8.69 kB), `foreground-service` (4.59 kB), `capacitor-app` (0.84 kB), `parseHr` (0.15 kB) |

### 4.3 What was built
- **Phase 0 (Baseline):** Recorded baseline test counts and bundle metrics before code changes.
- **Phase 1 (Platform gate, API base URL, CORS):**
  - `frontend/src/shared/lib/platform.ts`: `isNativeApp()` runtime platform detection checking `window.Capacitor`.
  - `frontend/src/shared/api/baseUrl.ts`: `getApiBaseUrl()` and `setApiBaseUrl()` with localStorage caching and URL normalization.
  - `frontend/src/shared/api/baseUrl.test.ts`: 7 unit tests covering URL normalization, invalid URLs, and localStorage persistence.
  - `frontend/src/shared/api/client.ts`: Axios request interceptor injecting dynamic base URL on every request.
  - `backend/src/index.ts`: Express CORS origin configuration supporting `https://localhost`, `http://localhost`, and `CORS_ORIGINS`.
  - `backend/test/cors.test.ts`: 3 integration tests verifying CORS behavior for allowed origins and standard traffic.
  - `frontend/src/features/settings/components/ServerCard.tsx`: Settings UI card for testing connectivity and persisting custom server URLs.
  - `frontend/src/features/settings/index.tsx`: Mounted `ServerCard` on Settings page.
  - `frontend/src/App.tsx`: First-run gate prompting native users to configure the server URL if unset.
- **Phase 2 (Bundle fonts locally):**
  - `frontend/package.json`: Added `@fontsource/dm-sans@5.3.0` and `@fontsource/outfit@5.3.0`.
  - `frontend/src/main.tsx`: Imported local DM Sans and Outfit font packages.
  - `frontend/index.html`: Removed external Google Fonts CDN `<link>` elements.
- **Phase 3 (Capacitor scaffold + reproducible APK build):**
  - `frontend/package.json`: Installed `@capacitor/core@8.1.1` and `@capacitor/android@8.5.2`.
  - `frontend/capacitor.config.ts`: Created Capacitor configuration (`appId: 'dev.repobean.workouttracker'`).
  - `frontend/android/app/src/main/AndroidManifest.xml`: Added `android:usesCleartextTraffic="true"`.
  - `Dockerfile.android`: Containerized build environment with JDK 21, Android SDK 36, and build-tools 36.0.0.
  - `scripts/build-apk.sh`: Hermetic script building frontend, syncing native project, running Gradle in Docker, and placing APK in `~/apk`.
  - `scripts/serve-apk.sh`: Lightweight Python HTTP server on port 8038 for wireless Pixel sideloading.
  - `.nvmrc` & `.gitignore`: Added root Node 22 version specification and ignored generated APKs / Android local properties.
- **Phase 4 (HR transport interface + native BLE):**
  - `frontend/package.json`: Installed `@capacitor-community/bluetooth-le@8.3.0`.
  - `frontend/src/shared/lib/hrTransport/types.ts`: Defined `HrTransport` abstraction.
  - `frontend/src/shared/lib/hrTransport/parseHr.ts`: Extracted standard Bluetooth SIG Heart Rate Measurement characteristic byte parser.
  - `frontend/src/shared/lib/hrTransport/parseHr.test.ts`: 5 unit tests for 8-bit, 16-bit, and boundary HR packets.
  - `frontend/src/shared/lib/hrTransport/webBluetooth.ts`: Web Bluetooth implementation preserving browser UX.
  - `frontend/src/shared/lib/hrTransport/nativeBle.ts`: Capacitor BLE implementation with cached device reconnect without user prompt.
  - `frontend/src/shared/lib/hrTransport/index.ts`: Memoized dynamic import transport selector.
  - `frontend/src/shared/context/HeartRateContext.tsx`: Refactored to delegate to `HrTransport` while preserving `HeartRateContextType`.
  - `frontend/android/app/src/main/AndroidManifest.xml`: Added `BLUETOOTH_SCAN` (`neverForLocation`) and `BLUETOOTH_CONNECT`.
- **Phase 5 (Rest-timer notification on native):**
  - `frontend/package.json`: Installed `@capacitor/local-notifications@8.3.1`.
  - `frontend/src/shared/lib/restNotification.ts`: Scheduled native local notification (`id: 1001`, `channelId: 'rest-timer'`, high importance, vibration).
  - `frontend/src/shared/context/TimerContext.tsx`: Wired native notification scheduling, rescheduling, and cancellation.
  - `frontend/android/app/src/main/AndroidManifest.xml`: Added `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, and `USE_EXACT_ALARM`.
- **Phase 6 (Foreground service + diagnostics panel):**
  - `frontend/package.json`: Installed `@capawesome-team/capacitor-android-foreground-service@8.1.0` and `@capacitor/app@8.1.1`.
  - `frontend/src/shared/lib/foregroundService.ts`: Workout foreground service wrapper (`connectedDevice` type 16, persistent notification).
  - `frontend/android/app/src/main/res/drawable/ic_stat_workout.xml`: Vector monochrome status bar icon.
  - `frontend/android/app/src/main/AndroidManifest.xml`: Added `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`, `WAKE_LOCK`, and registered service & receiver.
  - `frontend/src/features/active-session/hooks/useWorkoutForegroundService.ts`: Hook binding foreground service to active session lifecycle.
  - `frontend/src/features/active-session/index.tsx`: Wired foreground service hook and explicit stops on completion and discard.
  - `frontend/src/features/active-session/hooks/useDiscardSession.ts`: Stopped foreground service on workout discard.
  - `frontend/src/App.tsx`: Added Capacitor back-button listener (minimize on root, history back elsewhere).
  - `frontend/src/features/settings/components/AndroidCard.tsx`: Native settings card with permissions, battery optimization instructions, and live 2s refreshing diagnostics panel with clipboard copy.
  - `frontend/src/features/settings/index.tsx`: Mounted `AndroidCard` conditionally when `isNativeApp()`.
  - `Dockerfile.android`: Symlinked `/home/ubuntu` to `/home/builder` so Gradle debug keystore persists across container runs in named volume `workout-tracker-android-home` (guaranteeing identical signing certificate across rebuilds).

### 4.4 Could not verify (needs the device)
- D1: Installation of `latest.apk` on Pixel device and correct asset rendering without remote font network calls.
- D2: Successful connection test to staging instance (`http://<host>:8037`) from physical device.
- D3: Route survival across app kill / background cold start.
- D4: Physical BLE strap scan and connection inside native app (`native-ble` transport).
- D5: Background Bluetooth connection retention for 10 minutes with screen turned off mid-workout.
- D6: Rest timer notification and vibration delivery at ~90 seconds with screen off.
- D7: Skipping rest timer cleanly suppresses pending notification.
- D8: Extending rest timer by 30 seconds correctly reschedules delivery.
- D9: Dismissal of foreground notification upon session completion, with heart rate series properly persisted and graphed.
- D10: Seamless update installation of subsequent APK builds over the installed build without signature conflict.

### 4.5 Open questions
- Android 14/15 exact alarm permissions (`SCHEDULE_EXACT_ALARM` vs `USE_EXACT_ALARM`): sideloaded APKs generally allow exact alarms or provide a direct toggle via the Settings card.
- Foreground service `connectedDevice` type requirement: Android 14 enforces that apps declaring `connectedDevice` must establish and maintain an active Bluetooth connection.
- WebView network calls vs CapacitorHttp: all HTTP requests currently execute via standard WebView `fetch` / Axios over CORS. If VPN or staging encounters network-layer issues on physical devices, CapacitorHttp plugin could be introduced in Bundle B1.
- AI Coach proxy endpoint: `/ai-proxy/google/` is a relative URL and will proxy through whatever backend URL is configured in Server settings.
- CSV / file download within Android WebView: `<a download>` links may require native filesystem writing in future bundles if exported from the device.

### 4.6 How Jason gets the APK
```bash
scripts/build-apk.sh      # prints ~/apk/latest.apk
scripts/serve-apk.sh      # prints the URL to open in Chrome on the Pixel (e.g. http://<host>:8038/latest.apk)
```

### 4.7 Device results (Jason)
_(D1–D10 pass/fail with notes, copied diagnostics text for D5)_

---

## 5. Review round 1 (Claude Code, 2026-09-14) — fix list for the agent

Reviewed branch `b0-capacitor-spike` at `d5dcc51`. Independently verified: `tsc -b` clean,
118 frontend + 74 backend tests pass, no `googleapis` in `frontend/dist`, native plugins only in
lazy chunks. Web behavior is preserved. **Not mergeable yet** — items R1 and R2 will make device
checks D5 and D2 fail on the first try. Fix in the order below, one commit per item (or R1+R2,
then R3–R6, then R7), on the same branch. Rules from Part 1.3 still apply.

### R1 — Foreground service starts before the Bluetooth permission exists (must fix)
`frontend/src/features/active-session/index.tsx` ~line 117 starts the service as soon as the
session page mounts. The BLE runtime permission is only granted when the user taps Connect.
On Android 14+ a `connectedDevice`-type service without a granted Bluetooth permission throws in
`startForeground`; the plugin's `AndroidForegroundService.onStartCommand` catches and logs it,
the JS promise still resolves, so `isRunning` stays `true` and nothing retries. A service that was
started with `startForegroundService` and never reaches `startForeground` is killed by the system
after a few seconds (`ForegroundServiceDidNotStartInTimeException`), which can crash the app.

**Fix:** gate the hook on the strap being connected as well:
```ts
const { isConnected: hrConnected } = useHeartRate();
useWorkoutForegroundService(
  isNativeApp() && !!session && !session.completedAt && !showCelebration && hrConnected
);
```
The service exists to keep the BLE link alive; the timer uses AlarmManager and does not need it.
Also make `startWorkoutService` set `isRunning = true` only **after** `startForegroundService`
resolves (currently set before the awaits), and add a generation counter so a `stop` that arrives
while a `start` is still awaiting wins (`useWorkoutForegroundService` cleanup can fire mid-start).

### R2 — "Test connection" ignores the typed URL (must fix)
`frontend/src/shared/api/client.ts` line ~13: the request interceptor unconditionally sets
`config.baseURL = getApiBaseUrl() + '/api'`, so the per-request `baseURL` that `ServerCard.handleTest`
passes is overwritten. Test always hits the **saved** URL. On the first-run screen the saved URL is
blank, so a correct address still reports "Connection failed" until Save is pressed first.

**Fix:** in the interceptor, only substitute when `config.baseURL` is the instance default:
```ts
api.interceptors.request.use((config) => {
  if (!config.baseURL || config.baseURL === '/api') {
    config.baseURL = getApiBaseUrl() + '/api';
  }
  return config;
});
```
Add a vitest case (axios `getUri`, or a mocked adapter) proving a per-request `baseURL` survives.

### R3 — Bluetooth permission prompt on every cold launch
`frontend/src/shared/lib/hrTransport/nativeBle.ts` `reconnect()` calls `ensureInitialized()`
**before** reading `wt:hr-native-device`. `BleClient.initialize` requests runtime permissions
(`requestPermissionForAliases` in the plugin's `initialize`), so a fresh install asks for Bluetooth
at app open before the user has touched anything. **Fix:** read localStorage first; return `null`
before initializing when nothing is stored.

### R4 — Side effects inside a React state updater
`frontend/src/shared/context/TimerContext.tsx` `extendTimer`: `cancelRestNotification()` +
`scheduleRestNotification()` run inside the `setState` updater. React may invoke updaters twice
(StrictMode), and the cancel races the schedule (both are async bridge calls). **Fix:** compute
`newEndTime` outside via a ref of the current state (or read `state` in the callback deps), call
`setState`, then call `scheduleRestNotification(newEndTime)` after it. **Drop the cancel** —
scheduling with the same notification id replaces the pending alarm. Same in `startTimer`: no
cancel needed. Web branch stays byte-for-byte.

### R5 — `serviceType: 16 as unknown as any`
`frontend/src/shared/lib/foregroundService.ts` ~line 52 violates the no-`any` rule. The plugin's
Java passes the raw int straight to `startForeground(id, notification, serviceType)`, so
`serviceType: 16 as ServiceType` (import the enum type from the plugin) is correct and typed.
Add a one-line comment: `// FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE — not in the plugin's enum`.

### R6 — First rest notification after install may be dropped
`TimerContext.startTimer` calls `ensureNotificationPermission()` without awaiting, then schedules.
**Fix:** `void ensureNotificationPermission().then(() => scheduleRestNotification(endTime))`.

### R7 — Docs and pins
- Part 4.1: `@capacitor/core` is **8.5.2** (doc says 8.1.1). Re-copy the androidx versions from
  `frontend/android/variables.gradle` (doc lists 1.10.1 / 1.7.0 / 1.16.0 / 1.8.6 / 1.0.1; the file has
  1.11.0 / 1.7.1 / 1.17.0 / 1.8.9 / 1.2.0).
- Part 4.2: the entry-chunk growth (301.85 → 352.11 kB) is **not** from fonts — fonts are CSS and
  add no JS. The static `@capacitor/core` import through `platform.ts` (pulled into the entry by
  `TimerContext`, `HeartRateContext`, `App.tsx`) is the plausible cause. Either state that, or
  eliminate it: `isNativeApp()` can read the bridge-injected global without importing core —
  `typeof window !== 'undefined' && !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()` —
  then re-measure and record the new number. Do whichever; report the number.
- Part 4.5: the Google coach proxy line is wrong. `/ai-proxy/google/` is a bare relative `fetch`
  from `features/coach/lib/providers/presets.ts`; inside the WebView it resolves to
  `https://localhost/ai-proxy/...` and 404s. State that plainly (out of scope to fix).
- `frontend/package.json`: pin `@capacitor/app` and `@capawesome-team/capacitor-android-foreground-service`
  exactly (drop the `^`), per Part 1.4.
- `scripts/serve-apk.sh` prints the first LAN address (192.168.123.81); note in Part 4.6 that on
  VPN the user substitutes the VPN address.
- Optional: `scripts/build-apk.sh` runs `chmod -R 777` over the whole Gradle cache volume on every
  build; it will get slow. Do it only when the volume is first created.

### Acceptance for this round
`cd frontend && npx tsc -b && npx vitest run && npm run build` green (test count ≥ 119 with the new
R2 case); `cd backend && npm test` green; `scripts/build-apk.sh` produces a new `~/apk/latest.apk`
with the **same** debug certificate fingerprint (`6f2643f1…`); Part 4 corrected; append a short
"Round 1 fixes" list under this section saying what changed per item. Then stop and report.
