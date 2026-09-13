# Workout Tracker v3 — plan and decision record

Written 2026-09-12 from a read-only analysis of the repo at commit `27f6503` plus the discussion
that followed. This file is the durable record of what was decided, what was only recommended, and
what is still open. **Read this first when resuming.** This copy in `docs/` is canonical; tick the
boxes here as bundles ship.

Companion memory: `project_v3_direction.md` (short form). Earlier plans in this folder:
`currently-there-s-no-way-groovy-goose.md` (assisted lifts, unshipped) and
`there-are-2-things-iridescent-hoare.md` (coach dossier, shipped as 27f6503).

---

## 0. How to resume this later

1. `git log --oneline 27f6503..HEAD` — see what shipped since this was written.
2. `docker ps --format '{{.Names}}\t{{.Status}}'` — main (8035), wife (8036), staging (8037). Deploy only via `scripts/ship.sh` (CLAUDE.md → Development Setup).
3. Re-verify anything in §1 that a later commit could have changed before quoting it.
4. Find the first unchecked bundle in §4 / §5 and plan that one bundle. Do not plan the whole thing at once.

---

## 1. Where v2 stands (measured 2026-09-12)

| Measure | Value |
|---|---|
| Commits, first commit 2026-01-29 → HEAD 27f6503 (2026-09-09) | 122 |
| Frontend source / tests | ~14.1k lines / 106 tests (10 files), all green |
| Backend source / tests | ~3.5k lines / 41 tests (5 files), all green |
| Live DB (main): sessions / sets | 90 / 1,634 |
| Exercise rows in programs vs distinct names | 136 vs 51 |
| Sets with `exerciseId = null` (ad-hoc adds + swaps) | 364 (~22%) |
| Sessions with HR series / with notes / cardio sets | 36 / 4 / 3 |
| Programs (archived, mostly test junk) | 18 (13 archived) |
| Payload Progress page downloads (`/sessions/history?limit=1000`) | ~636 KB, grows ~7 KB/session |
| localStorage key families per in-progress session | 10 |
| Settings contexts persisted only in localStorage | 4 (profile, progression, coach, theme) |
| CLAUDE.md size (mostly changelog) | 56 KB |

Other facts: two production stacks exist — yours (`/opt/docker/workout-tracker`, port 8035, volume
`workout-tracker-data`) and the wife stack (`/opt/docker/workout-tracker-wife`, a separate git clone
at `6fb8a19`, one commit behind, port 8036, volume `workout-tracker-wife-data`). No CI, no `.github`,
no `scripts/` dir, no eslint config (the `lint` script references eslint which isn't installed).
All images are tagged `latest` only. Last DB backups on disk: 2026-07-03 in `~/backups/workout-tracker/`;
the July backup script was in a scratchpad and is gone. GitHub remote: `RepoBean/workout-tracker`.
GUARDIAN.md (two-agent scoped-prompt protocol from January) is no longer how work happens.
`backend/src/types/index.ts` claims to be shared with the frontend; nothing imports it and it is stale
(no cardio/HR fields). Fonts load from Google Fonts at runtime in `index.html` (matters for offline/APK).

Code health verdict: good. Feature-folder layout is followed, largest file 586 lines, steady
"fix bundle" cadence. v3 is a schema-and-contract change, **not** a UI rewrite.

---

## 2. The rails — keep, drop, or rewrite

| Rule | Verdict | Why |
|---|---|---|
| 5 tables max | **Drop** | No exercise identity (history joined by case-insensitive name in ~18 places; one rename already split a lift; coach uses substring matching as a workaround; persona tells the model to classify movement patterns itself because the data can't). In-progress session structure (ad-hoc adds, swaps, order, hidden, nav, HR samples, input overrides) lives in localStorage → device-bound, lossy history (can't tell "skipped" from "not in workout"), and a whole bug class already paid for in June/July. Settings per-device. JSON columns (`exerciseNotes`, `heartRateSeries`) are tables in disguise. |
| Dumb backend | **Rewrite** as "server owns data + derived reads; client owns interaction + optimistic UX" | Already leaky in the right direction (week streak in `/stats`, rotation advance in `/complete`, CSV export, previous hints). The leaks done under the rule are bad: `/sessions/:id/previous` loads *every set in the DB once per exercise* then filters by name in JS ("SQLite LOWER() in Sequelize is tricky"); `history-by-name` same. Frontend downloads full history for Progress and the coach dossier. |
| No migrations framework | **Drop** | Hand-rolled list of 14 additive `ALTER TABLE ADD COLUMN`s. Can't rename, drop, backfill, or add FK tables. With the table cap it's the wall in front of every schema idea. |
| SQLite only | **Keep** | Not the problem. |
| React state + TanStack Query + Context only (no Redux/Zustand) | **Keep** | Held up well; the 10 Hz timer fix shows contexts are handled with care. The state problem is *where* state lives (localStorage vs server), not the library. |
| Mobile-first | **Keep** | It's the product. |
| lbs | **Keep as the main unit** (Jason 2026-09-12). A kg toggle later = display-only conversion. |
| No auth, behind VPN | **Keep** | Jason prefers **multi-instance over multi-user** (2026-09-12). |
| Shared types file | **Replace** with Zod schemas as the single source (validation + client types). |

---

## 3. Decisions made 2026-09-12 (Jason's words paraphrased)

- **Multi-instance, not multi-user.** One stack per person, one checkout, one compose file.
- **Pounds stay.** Toggle "would be possible later".
- **Sequelize → Drizzle: yes.** ("converting to drizzle makes sense"). Jason doesn't care about the ORM itself; the gate is that the backend HTTP tests keep passing.
- **Android client: yes, as a Capacitor wrapper of the existing React build.** Two real gym problems drove this: when the browser is lowered the HR strap drops out, and the rest-timer notification won't fire unless the app is up. Both phones are **Pixel Androids** (no iOS).
- **Offline support welcome** ("if offline support is possible that's good"); VPN model stays.
- **Two-part framing confirmed:** (1) v3 data-model track, (2) Android client track. Independent.
- **Keep using the app throughout.** v3 ships as backward-compatible bundles on `main` through
  tests → staging (copy of real data) → your stack → wife's stack. No long-lived branch.

Technical facts behind the Android decision (so nobody re-litigates them):
- Browsers cannot schedule a notification for later (Notification Triggers never shipped). On the web the reliable timer notification is a **server push** via a service worker. Not planned, because…
- **Web Bluetooth cannot survive backgrounding** and service workers have no Bluetooth access. Only a native foreground service (what running apps use) keeps the strap connected with the screen off. This is what decides "native".
- Capacitor = same React build in a WebView + native plugins. ~95% code reuse. Sideloaded APK over the VPN; no Play Store.

---

## 4. Track A — data model (in order; each is one shippable bundle)

### Bundle 0 — Step Zero: the safety floor (no product change) — SHIPPED 2026-09-13
- [x] **Single-checkout compose.** One `docker-compose.yml` with three service pairs and profiles `main` / `wife` / `staging`. Same two images for all three. Per-instance: container name, named volume, host port (8035 / 8036 / 8037), **private network per pair with the backend aliased as `backend`** (nginx.conf proxies to `http://backend:3001`; three backends on one network would be ambiguous). Existing volumes `workout-tracker-data` and `workout-tracker-wife-data` declared `external: true`; `workout-tracker-staging-data` new. Build once, run three times (either one service carries `build:` and the others reference the image, or all carry identical `build:` and the ship script builds explicitly once — implementation detail).
- [x] **Migrate the wife stack into it.** From `/opt/docker/workout-tracker-wife`: `docker compose down` (**never `-v`** — that deletes her volume), then `docker compose --profile wife up -d` from the main checkout. Zero data movement. Delete the old folder after verifying.
- [x] **`scripts/backup.sh <instance>`** — consistent snapshot via `VACUUM INTO` run inside the backend container with the `sqlite3` npm module (no sqlite3 CLI in the image; node_modules at `/app`), `docker cp` out, `PRAGMA integrity_check` + 5 table counts, delete the in-volume temp. Target `~/backups/workout-tracker/<instance>-<YYYYMMDD-HHMMSS>.sqlite`. Add a cron + retention + an off-machine copy (this was Priority 1 since July).
- [x] **`scripts/restore.sh <instance> <file>`** and **`scripts/seed-staging.sh`** (= backup main → restore into staging).
- [x] **`scripts/ship.sh <main|wife|staging>`** — (1) both test suites + `tsc --noEmit`; (2) **refuse if `GET /api/sessions/active` on that instance is non-null** (never deploy mid-workout; `--force` override); (3) backup that instance; (4) `TAG=$(git rev-parse --short HEAD) docker compose --profile X up -d --build`; (5) wait healthy, print sha/tag.
- [x] **Tagged images** (`image: workout-tracker-backend:${TAG}`) + **`scripts/rollback.sh <instance> <tag>`** (redeploy old tag, optionally restore a backup).
- [x] **CI**: `.github/workflows/test.yml` running both suites on push (second opinion; ship.sh is the gate). Fix or delete the dead `lint` script.
- [x] `docs/` copy of this plan in the repo (this file).

### Bundle 1 — Drizzle swap (pure refactor, no schema change)
- [ ] `drizzle-orm` + `better-sqlite3` + `drizzle-kit`; remove `sequelize` + `sqlite3`. (Also removes the forks-pool constraint in backend vitest — sqlite3 addon wasn't worker-thread safe.)
- [ ] `backend/src/db/schema.ts` mirroring the current 5 tables **exactly** (same table/column names and types) so existing DBs are used as-is.
- [ ] Migration runner: drizzle-kit SQL migrations in `backend/drizzle/`, applied at startup, recorded in drizzle's migrations table. Baseline handling for existing DBs: keep the current duplicate-safe `runMigrations` column list as a one-time pre-baseline step, then a `CREATE TABLE IF NOT EXISTS` baseline. Decide the exact mechanism during implementation; test against a **copy of the live DB on staging**.
- [ ] Rewrite the 4 routers on Drizzle. Fix the two full-table-load queries (`/sessions/:id/previous`, `/exercises/history-by-name`) with `lower(exerciseName) = lower(?)` (consider an expression index).
- [ ] `test/app.ts` builds the app on an in-memory better-sqlite3 DB. **Gate: all backend tests pass unchanged.**

### Bundle 2 — Exercise catalog
- [ ] New table (name TBD: `ExerciseDefinitions`): id, name (unique, case-insensitive), aliases (JSON), movementPattern, equipment, isAssisted/bodyweight flag, defaultRestSec, archived.
- [ ] Nullable `catalogId` on `Exercises` (program rows) and `Sets`; **names stay denormalized** for history independence.
- [ ] Backfill: distinct lower(name) across Sets ∪ Exercises → catalog rows; fill `catalogId`. Merge tool in Settings (fold B into A; fixes the "Low Incline Dumbbell Press" / "Low Incline DB Press" split).
- [ ] Progress, PR check, previous hints, coach dossier key by `catalogId`; renames become safe. Expand/contract: old name-based code keeps working until the new path is proven.

### Bundle 3 — Session structure on the server
- [ ] New table `SessionExercises`: sessionId, catalogId (nullable), name, orderIndex, targetSets, targetReps, supersetGroup, exerciseType + cardio targets, source (`program` | `adhoc` | `swap`), replacesId, skipped, note. Created at session start from the workout snapshot. Mutations: add, swap, reorder, skip. `Sets.sessionExerciseId`.
- [ ] localStorage keeps only transient per-device state (nav position, input overrides, cardio timer, HR sample buffer). Resume from any device. History shows skipped exercises.
- [ ] `Session.exerciseNotes` likely migrates to `SessionExercises.note` (decide then).
- [ ] Supersedes old "Item 6 ad-hoc id hardening" from the May frontend plan.

### Bundle 4 — Settings + bodyweight
- [ ] `Settings` key/value (or Profile) table: DOB, sex, resting/max HR, progression settings. **Coach API key stays browser-only by default** (decide explicitly). Theme stays local.
- [ ] `BodyweightLog` (date, lbs). Makes the assisted-lift plan's effective-weight calc honest over time.
- [ ] Revisit the unshipped **assisted lifts** plan here: either keep its sign-as-notation approach (`weight < 0`) or use the catalog `isAssisted` flag. Both work; the plan file has the full site list.

### Bundle 5 — Derived-read endpoints
- [ ] `/api/exercises/:catalogId/history`, a progress summary endpoint, `/sessions/:id/previous` rewritten, `/api/coach/dossier` text built server-side. Frontend stops downloading the full history; `useProgressData` and `dossier.ts` shrink or move.

### Bundle 6 — Rules and docs rewrite
- [ ] CLAUDE.md: v3 sacred rules; changelog → `CHANGELOG.md`; delete GUARDIAN.md; architecture tree refreshed.
- [ ] Zod schemas as the single source of validation + types; delete stale `backend/src/types/index.ts` duplication.
- [ ] Carry-overs still open from May plan: sample default programs (needs a content decision), recharts memo (minor).

---

## 5. Track B — Android client (Capacitor) and offline

### Bundle B0 — Capacitor spike (prove the two background behaviors, nothing else)
- [ ] `npx cap add android` under `frontend/` (`android/` dir, `capacitor.config.ts`). Plugins: `@capacitor-community/bluetooth-le`, `@capacitor/local-notifications`, an Android foreground-service plugin (e.g. `@capawesome/capacitor-android-foreground-service`), `@capacitor/app`.
- [ ] `HeartRateContext`: a transport interface (`connect / disconnect / onSample`) with two implementations — Web Bluetooth (browser) and native BLE (app). Nothing above the context changes.
- [ ] `TimerContext`: on native, schedule an exact local notification at timer start, cancel on stop/complete; web path unchanged.
- [ ] Foreground service while a session is active ("Workout in progress" persistent notification).
- [ ] **API base URL becomes a setting** (VPN address) instead of relative `/api` (`shared/api/client.ts`). Dev builds point at **staging (8037)** or the Vite dev server; release builds at 8035 / 8036.
- [ ] **Bundle fonts locally** (Google Fonts at runtime fails offline / in the APK without network).
- [ ] Build: Android SDK + JDK on the host, `./gradlew assembleDebug`. Claude can build the APK from the CLI but **cannot run it — verification is on Jason's Pixel**: strap stays connected with screen off ≥10 min; timer fires with screen off; app set to battery **Unrestricted**; the strap pairs once more in the app (separate pairing path from Chrome).
- [ ] Serve the APK from the home server over the VPN for sideloading.

### Bundle B1 — Full Android app
- [ ] Foreground-service lifecycle bound to the active session (start on session start/resume, stop on complete/discard), elapsed time in the notification, tap → deep link into the session.
- [ ] Android back button, status bar / safe areas, app icon, release signing (self-signed keystore kept **outside the repo**), versionCode from commit count. Release APK built from the **same commit** as the web deploy; an old APK keeps working because the API only ever gains fields.

### Bundle B2 — Offline (after Track A Bundle 3, not before)
- [ ] Service worker (vite-plugin-pwa / Workbox): precache the shell so the app opens without the VPN; API network-first.
- [ ] Set-log outbox: TanStack Query paused mutations + a persister (IndexedDB), replayed in order when online. Stays inside the no-new-state-library rule. Single user → conflicts are minimal. Background Sync optional.
- [ ] **Sequencing rule:** moving session structure to the server (A3) and adding an offline queue pull in opposite directions. Do A3 first, then design the queue to carry structure mutations too; the other order builds the queue twice.
- [ ] Web Push for the timer: **not planned** (native local notifications cover it). Revisit only if browser-only use returns.

---

## 6. How every bundle ships (the loop that keeps the app usable)

| Stage | What | Who's affected |
|---|---|---|
| Tests | `tsc --noEmit` + both vitest suites locally, then CI | nobody |
| Staging | `seed-staging.sh` (fresh copy of live data) → `ship.sh staging` → migration runs → smoke test on 8037 | nobody |
| Your stack | `ship.sh main` (backup first; refuses if a session is active) | you, as canary |
| Wife stack | `ship.sh wife` a few days later, same commit | both |

Rules: migrations are additive until an explicit cutover; never deploy mid-workout (script enforces);
rollback = previous tag + restored backup; the wife stack lags by days, never leads.

---

## 7. Still open / not decided

- Which track goes first. **Recommendation:** Step Zero → Drizzle (A1) → Capacitor spike (B0) → then interleave A2… and B1 as desired. B0 is the fastest visible payoff; A1 is foundations.
- Coach write access (e.g. adjusting next session's targets with confirmation). Deferred; `project_coach_usage` memory says the coach is for at-home review.
- kg display toggle — later, display-only.
- Whether `exerciseNotes` moves into `SessionExercises.note` (likely yes, A3).
- Coach API key server-side or browser-only (default: browser-only).
- Staging permanently up vs on demand — **decided: permanently up** (Step Zero, 2026-09-13).
