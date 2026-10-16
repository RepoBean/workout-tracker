# Workout Tracker v4: plan and decision record

Written 2026-10-12 at commit `1b3232b`, after a read-through of openGym
(<https://github.com/DuarteSantos8/openGym>, v1.4.1) and the discussion that followed. Same rules as
`v3-plan.md`: this copy is canonical, tick the boxes as bundles ship, and plan one bundle at a time.

**Validated against the code 2026-10-15** (at `8d3c083`). File:line references below are from that
read and will drift; re-check them when writing each bundle doc.

openGym is **AGPL-3.0**. Ideas only: no code, mappings, catalog or media copied from it.

---

## 0. How to resume

1. `git log --oneline 1b3232b..HEAD`: see what has shipped since.
2. Find the first unchecked bundle in §2 and write its `docs/v4-bundle-*.md` before building it.
   Each bundle lists **Decide in the bundle doc** items: put the recommended default to Jason, don't
   silently pick.
3. Every bundle ships staging → main → wife on the same commit, with a `CHANGELOG.md` row.
4. §3 holds the cross-cutting rules (compatibility, docs to update); every bundle doc checks them.

---

## 1. Decisions (2026-10-12)

| Topic | Decision |
|---|---|
| Quick wins (wake lock, timer screen flash, swipe-to-copy set, undo on delete) | **Declined.** Do not re-propose. |
| Measurements, progress photos | **Out.** The bodyweight log is weight only. |
| Old combined-dumbbell history | **Bulk fix, reviewed.** Claude lists every affected set with its proposed weight (halved ranges, plus Pull-Up 2026-09-18/09-26 +40 → −40). Jason approves the list. Applied through the API after `scripts/backup.sh main`. |
| Logged past workouts and the rotation | **Never advance** `currentWorkoutIndex`. |
| Bodyweight entry | From the bodyweight chart in Progress. Settings shows the latest weigh-in. |
| Settings sync | Profile, progression, coach config **including the API key**, and the coach thread move to the server (C2). Key stored as plain text; acceptable because the app is VPN-only. Theme, timer, server URL and HR strap stay per device. This reverses `v3-plan.md` ("coach API key stays browser-only"). It is **not** cloud sync or cross-device resume: the data stays on the instance's own server, and no in-progress session moves between devices. |
| Muscle tags | **Optional, never required.** Adding an exercise stays name + sets/reps. Tags come from a **one-off, reviewed seed** from free-exercise-db (public domain) for name matches, and are edited in Settings → Exercise catalog. The server never guesses tags on insert. |
| Progression presets (5×5, Greyskull) | Low priority, at the end of C4 or cut. |
| Wife instance | Gets everything, a few days after main as usual. |
| Order (2026-10-15) | C1 history edit → C2 settings → C3 bodyweight → C4 progression → C5 muscles → C6 heatmap → C7 Health Connect. Bodyweight was split from settings; progression moved ahead of muscles and the heatmap. |
| Health Connect | Last (C7), kept. It is the only bundle that needs an APK release. |

---

## 2. Bundles, in order

### [x] C1: History editing + logging past workouts

> Bundle doc: `docs/v4-bundle-c1-history-edit.md`. Shipped to staging + main 2026-10-15 (`7cc9b04`); wife pending.

**UI**
- History → open a session → edit mode: change weight/reps/RPE, add or delete sets, change the date.
  `SessionCard.tsx` renders its own rows (it does not use ExerciseCard/SetInput); the completed
  `/workout/:id` page renders `CompletedSessionSummary`. Host edit mode on one of them.
- **Do not reuse `useActiveSession` / `ExerciseCard` for edits.** Their logSet stamps live strap HR,
  starts the rest timer, fires the PR toast (whose baseline includes this and later sessions), runs
  the RPE flow and auto-advance. Build a separate edit-mutation hook with none of that; reuse
  `SetInput` only.
- "Log a past workout" = create an already-completed session, then open it in the same edit mode.
  Pick a date + time (default 18:00, built in **local** time client-side, sent as `toISOString()`),
  blank or from a program workout. `AdHocWorkoutPicker` calls `/start` itself today; refactor it to
  a pure `onChoose(workoutId | blank | cardio)` so both flows share it. One editor for both features.
- In edit mode, hide the `/previous` / history-by-name hints. They have no "before this session"
  bound, so they would show this session or a later one.

**Backend**
- Remove the three `if (session.completedAt)` guards on set POST/PUT/DELETE (`routes/sessions.ts`
  ~460/512/650). Keep the `/complete` guard. `exercise-note` has none (notes are already editable).
  Flip `backend/test/sessions.test.ts` "rejects sets on a completed session". This changes behaviour,
  not shape: no client branches on the 400. Side effect: a stale tab or old APK logging to a session
  already completed elsewhere now succeeds instead of failing. Accepted.
- **Every set POST/PUT/DELETE also bumps the parent `Sessions.updatedAt`** in the same transaction.
  Today only `exercise-note` and `/complete` do. C1's cache key (below) and C7's sync both depend on
  it. Add a test.
- **Create completed:** `/start` gains an optional `completedAt` (ISO; reject future) and optional
  `durationMin` (default 60). When present it inserts `createdAt = completedAt − duration` and
  `completedAt` in one row, so the session never shows in `/sessions/active` (Resume card, `ship.sh`
  deploy refusal, Android foreground service), and never advances the rotation (only `/complete`
  advances it, and this session never goes through `/complete`). The server forces `isAdHoc: true`
  whenever `completedAt` is sent, so it never depends on the client. Without `workoutId`, `/start`
  names it 'Ad-hoc' / 'Quick Workout'; fine for a blank log.
- **Date edit:** new `PUT /api/sessions/:id` (`completedAt`, optional). It shifts `createdAt` **and
  every set's `createdAt`** by the same delta. The duration (dossier, SessionCard,
  CompletedSessionSummary) is `completedAt − createdAt`, and the HR-chart set markers are at
  `set.createdAt − session.createdAt` (SessionCard ~175). `heartRateSeries` is offsets from
  `createdAt`, so it stays aligned. Reject a future `completedAt`.
- So the API gains **one optional field on `/start` and one endpoint**. No new table.

**Rules**
- Sorting: everything server-side and client-side already orders by `completedAt` (setsByName,
  `/history`, CSV, Progress, dossier), so a backdated session lands correctly. Same-day order comes
  from the picked time. Within a session sets order by id, so a newly added exercise shows last.
  Accepted.
- setNumber on add = **max existing + 1** for that exercise (not `count + 1`, which ExerciseCard
  uses today and would duplicate after a mid-list delete and collide setNumber-keyed maps).
- Notes are keyed by exercise name: deleting an exercise's last set clears its note. There is no
  rename in edit mode (a rename is a catalog merge or a swap, not a history edit).
- HR fields on an edited session are kept. A logged past session has none.
- Catalog: POST/PUT already resolve `catalogId` from the name. A typo'd name creates a catalog row;
  boot GC removes it once it is unreferenced.

**Caches**
- An edit invalidates `session(id)`, `history`, `stats`, `calendarSessionsAll`,
  `previousSessionAll`, `exerciseHistoryByNameAll`, `exerciseAllSetsAll` and `catalog`. Reuse the
  `useInvalidateCatalogReaders` list in `queries.ts` and add stats + calendar. The existing
  `useDeleteSession` misses previous/byName/allSets too; fix it in the same change.
- **Coach all-time memo goes stale.** Its key (`useCoachDossier.ts` ~100) is
  version:newestId:count:today:bodyweight:catalogFingerprint; a set edit or date change alters none
  of these. Add the max session `updatedAt` from history (works once the bump above is in). Bump
  `ALLTIME_FORMAT_VERSION` for the local-day change below.

**Local day (firm task, not "check first")**
- It reproduces: the API sends ISO `…Z`, and these take the UTC day, so a session finished after
  ~8 pm Eastern lands on tomorrow:
  - `liftOverview.ts` `isoDate` (compared against local `today` via `daysBetween`)
  - `dossier.ts` `isoDate` (headers, sort, notes, dropped-days count)
  - CSV export date (`sessions.ts` ~224, `toISOString().split('T')[0]`)
- Switch the two frontend `isoDate`s (`dossier.ts` ~39, `liftOverview.ts` ~51) to a local date key.
  Reuse `localDateKey` (`volumePeriods.ts` ~24) or `localToday` (`liftTrend.ts` ~41); move the one
  you pick to `shared/lib` rather than importing across features.
- CSV: format the date with local getters, like the `/stats` code at ~281. With the container on
  UTC that is still the UTC day until `TZ` is set (decision below), and then both are correct.
- `/stats` week streak uses local getters, but the container runs in UTC (no `TZ` in compose), so it
  counts UTC Sunday weeks while ThisWeek/volumePeriods count local ones.
- Already local: Calendar, ThisWeek, volumePeriods, chartRange, SessionCard dates,
  PersonalRecordsTab, coach `tools.ts` `localIsoDate`.

**Bulk correction** (after the editor ships)
- The reviewed dumbbell/Pull-Up fix (§1) goes through `PUT /sessions/:id/sets/:setId`. Run it on
  staging first, then `scripts/backup.sh main`, then main. Negative weights pass the −500 floor.

**Decide in the bundle doc**
- Deleting every set of a session: keep it empty, or delete the session? Recommend keeping it with a
  "Delete session" button beside it (deletion is already its own action).
- The CSV date and `/stats` streak: set `TZ` in compose for the backends (recommend; one line, the
  users are in one zone), or accept UTC. Verify it takes effect with
  `docker exec workout-tracker-staging-backend node -e 'console.log(new Date().toString())'`.
- Date-edit bounds: allow any past date? Recommend no future dates, and no lower bound.

### [x] C2: Server-side settings

> Bundle doc: `docs/v4-bundle-c2-settings.md`. Shipped to staging + main 2026-10-15 (`133aef8`); wife pending.

**New table 7 (`Settings`)**, so the written case goes in the bundle doc first, and the CLAUDE.md
updates in §3 apply. Split from the bodyweight log (C3) because it is the riskier half (sync cache,
one-time migration, rollback, the coach thread) and fixes the daily annoyance: phone and computer
disagreeing on HR zones and coach history. C3 builds on it.

- Today `workout-tracker-profile`, `workout-tracker-progression`, `workout-tracker-ai-coach`
  (`{enabled, provider, apiKey, model, baseUrl}`) and `workout-tracker-coach-thread` live in
  per-device localStorage, so the phone and the computer can compute different HR zones and can't
  see each other's chat.
- New `Settings` table: one row per key (`profile`, `progression`, `aiCoach`, `coachThread`), JSON
  value, `updatedAt`. `GET /api/settings` returns `{ [key]: { value, updatedAt } | null }`, with
  **null for a key never stored, not defaults**. Otherwise the migration below can't tell "empty" from
  "default". The client applies its own defaults. `PUT /api/settings/:key` takes the value. The key
  is a Zod enum validated with `validateParams`, and each value has its own Zod schema that strips
  unknown fields. Last write wins, except the thread (below).
- **`profile` on the server excludes `bodyweight`.** It stays local until C3 retires it into
  BodyWeights. Syncing it now and dropping it a bundle later would only churn the schema. C3 adds
  the weigh-in prompt's dismissal flag to the `profile` schema. A C3 → C2 rollback strips the flag,
  so the prompt reappears once (accepted).
- Stays per device: `workout-tracker-theme`, `workout-tracker-timer`, `wt:api-base-url`,
  `wt:hr-native-device`, `wt:coach-dossier-alltime`, and all per-session keys (`wt:cardio:<sid>…`,
  `wt:livehr:…`, `wt:hrsamples:…`, `wt:setinput:…`, `wt:adhoc-blank:…`, `adhoc-exercises-<sid>`,
  `workout-exercise-order-<sid>`, `hidden-exercises-<sid>`, `workout-nav-step/superset-<sid>`).
- **Keep localStorage as the synchronous cache.** All three contexts read it synchronously in
  `useState(() => …)`, and the consumers would be wrong while a fetch is pending:
  - the progression hint, which feeds SetInput's one-shot prefill (ExerciseCard ~78)
  - HR zones (CardioSetInput ~82, TimeInZoneBar ~21)
  - the coach tab (App.tsx ~73), which would flicker
  - the dossier, which would be built with defaults and churn its memo key

  So: render from local, hydrate from the server once, write through on change. The coach page
  stays disabled until settings have hydrated (same rule as the dossier).
- Migration: a new frontend that finds a key empty on the server uploads its localStorage copy once,
  then reads the server. The first device wins; the second device's local values (including a
  different coach conversation) are replaced. Accepted, but say so in the bundle doc. Old
  frontends/APKs keep using localStorage and never touch the endpoint.
- Rollback: on an older backend `/api/settings` 404s. The client treats that as "use local", with
  no error toast (the axios client toasts by default), and keeps the local copy current for exactly
  this case.
- **Coach thread.** It is capped at 40 messages (`thread.ts`), but replies run up to 4,096 tokens,
  so the worst case is ~300 KB. `express.json()` uses the default 100 KB limit (`index.ts` ~28), so
  set an explicit limit (e.g. 1 MB) on that route. Today it saves on every `thread` change
  (coach/index.tsx ~67). To avoid two devices clobbering each other: the PUT carries the
  `updatedAt` it read, and a mismatch returns 409. The client then reloads, and the user resends.
  Reload it on page focus. New Chat = PUT an empty array. The dossier ref pin is per page and never
  stored, so it is unaffected. The content is user/assistant text only (no ids or tool payloads).
- **API key** in plain text, same as localStorage today (decided 2026-10-12, VPN-only, one user per
  instance). `GET /api/settings` is the only place it is served; never in exports, CSV, logs or
  `scripts/api-snapshot.sh`. It will be in the DB backups (local + NAS).
  - Fix the global error handler (`index.ts` ~56): `console.error(err)` on a body-parser
    `entity.parse.failed` prints `err.body`, the raw request (it would log the key), and wrongly
    answers 500. Return 400 and don't log the body.
  - `scripts/seed-staging.sh` copies main's DB, so staging would hold Jason's key and thread, and
    headless agents test on staging. Blank `aiCoach.apiKey` and `coachThread` after seeding.
- Scripts: `backup.sh` ~39 and `restore.sh` ~31 hard-code 5 tables (they already miss
  ExerciseCatalog). Add ExerciseCatalog and Settings to the count/sanity lists (BodyWeights comes
  in C3). Never add settings to `api-snapshot.sh`.

**Decide in the bundle doc**
- Is `aiCoach.model` per instance (the plan) or per device? Recommend per instance.

### [ ] C3: Bodyweight log

> Bundle doc: `docs/v4-bundle-c3-bodyweight.md` (built 2026-10-16, on staging). Decision 2026-10-16: no first-run
> prompt or dismissal flag; Settings → Profile's bodyweight field logs today's weigh-in.

**New table 8 (`BodyWeights`)**, with its own written case in the bundle doc. Needs C2 (the
first-run prompt's dismissal flag lives in the server-side `profile`). Add BodyWeights to the
`backup.sh`/`restore.sh` lists and a `bodyweights` snapshot to `api-snapshot.sh`.

- `BodyWeights` (id, `date` **plain local `YYYY-MM-DD` text**, weight lbs, createdAt, updatedAt in
  the Sequelize format). A weigh-in is a calendar day, not an instant. **Unique on `date`**; logging
  the same day again overwrites.
- Endpoints `GET/POST /api/bodyweights`, `PUT/DELETE /api/bodyweights/:id`. Zod range 50–700 (same
  as `hrZones.ts`).
- The case: one profile value, kept in localStorage, is per device (app ≠ web) and rewrites every
  past assisted-lift 1RM whenever it changes.
- Bodyweight for a set's date: the latest weigh-in on or before the session's **local** day
  (convert `completedAt` first; a raw string compare against the UTC timestamp misassigns evening
  sessions). Else the **earliest** weigh-in, which back-applies a later weight to older history but
  keeps it consistent across devices (accepted). Else the profile value (no weigh-ins at all).
- **Profile `bodyweight` is retired into BodyWeights** (C2 never synced it). The local value stays
  only as the last-resort fallback and the seed for the first-run prompt. Otherwise there would be
  two sources of truth.
- `effectiveWeight()` call sites (13 at validation time; build a pre-sorted "weight on date" lookup
  once and pass it down, no per-set query):
  - Direct, date in scope: `liftOverview.ts` ~72, `exerciseIndex.ts` ~161 and ~299,
    `dossier.ts` ~220, `StrengthDetail.tsx` ~88, `SessionCard.tsx` ~225.
  - Direct, needs work: `usePrCelebration.ts` ~41 (today); `personalRecord.ts` ~30
    `computeBestOneRepMax`. Its input type drops the `completedAt` that `all-sets-by-name` already
    returns; widen it.
  - Via `setVolume()`: `active-session/index.tsx` ~266, `CompletedSessionSummary.tsx` ~19,
    `SessionCard.tsx` ~76, `useProgressData.ts` ~77. The `volumeOf(set)` used by `volumePeriods.ts`
    has only the set; add a date argument (the callers have the session).
- First run: no weigh-ins + a profile bodyweight → offer to save it as today's weigh-in. The
  dismissal flag lives on the server (in `profile`), so it isn't asked again on the other device.
  From then on the profile field in Settings is read-only and shows the latest weigh-in.
- Progress: bodyweight chart + "log weigh-in". Coach dossier: the athlete line (dossier.ts ~390,
  today `bodyweight N lb`) becomes "bodyweight 182 lb (2026-10-10), −4 lb over 90 d".
  The all-time memo key's `bodyweight` part becomes a weigh-ins fingerprint (count + latest
  date/updatedAt); a format-version bump alone won't refresh it on a new weigh-in. Bump
  `ALLTIME_FORMAT_VERSION` too.

### [ ] C4: Progression schemes
- Per-exercise `progressionScheme` column on Exercises, **`NOT NULL DEFAULT 'double'`** (= today's
  behaviour) so an older image's inserts still succeed.
- `computeProgression` is called only from `ExerciseCard.tsx` ~104, with the previous session's sets
  (`/previous`), `targetReps` and the global `incrementLbs`. `exercise` is the Exercises row for
  program slots, so it can read the scheme once the API and types carry it.
- Add `linear` and stall-triggered deload. The stall rule (`stallRun` in `shared/lib/liftTrend.ts`)
  needs many sessions, but `/previous` returns one. Use `all-sets-by-name` (all-time `completedAt` +
  weight/reps, already cached for `usePrCelebration`) with the **raw signed** weight. The `reason`
  string stays.
- The global `ProgressionContext.enabled` gates every scheme; `incrementLbs` stays global.
- Ad-hoc and swapped exercises are virtual (`id: -Date.now()`, `lib/virtualExercise.ts`), so they
  always use `double`. Set the default in `makeVirtualExercise`.
- Every path that copies exercise fields lists them explicitly; add the field to each:
  - export (`programs.ts` ~184)
  - import (`importExerciseSchema`)
  - program duplicate (`insertProgramTree`)
  - workout duplicate (`workouts.ts` ~160)
  - the coach's `propose_program` normalizer (`coach/lib/tools.ts` ~207)
  - the Exercise create/update schemas

  v1 files without the field still import.
- **Compatibility:** an older backend strips the unknown field (plain `z.object`), so a newer export
  imported on an older instance silently loses it (accepted). And `updateExerciseSchema`'s
  `refine(keys > 0)` makes a PUT carrying *only* `progressionScheme` 400 on an older backend. Have
  ExerciseForm always send the full exercise, so the request never consists of the new field alone.
- The picker lives in a new collapsible "Advanced" section of ExerciseForm (351 lines of flat
  state today). Adding an exercise stays name + sets/reps.
- Independent of C2/C3. Placed ahead of muscles and the heatmap because it changes what happens
  at the gym every session.
- Optional at the end: 5×5 / Greyskull presets.

**Decide in the bundle doc**
- Deload size and trigger (recommend 10% after the 3-session stall flag), and whether `linear`
  adds weight every session or only when all target reps were hit (recommend the latter).

### [ ] C5: Muscle analytics
- `muscles` JSON column (`{primary: Muscle[], secondary: Muscle[]}`), **nullable, NULL = untagged**,
  on **ExerciseCatalog**. Additive column: a CHANGELOG row plus a migration. Older images select
  columns explicitly and their inserts work with a nullable column. Merges inherit tags through the
  catalog. A program-exercise **rename to a new name resolves to a new, untagged entry**
  (`resolveCatalogId` insert); only merges inherit.
- Fixed muscle vocabulary as a Zod enum. New endpoint `PUT /api/catalog/:id` (`muscles` only). It
  **bumps the row's `updatedAt`**, because `catalogFingerprint` (`shared/lib/catalog.ts`) is
  `count:max(updatedAt)` and drives the coach memo. Add `muscles` to `listEntries`' explicit select
  so `GET /api/catalog` returns it.
- Merge deletes B (`routes/catalog.ts`) and split rebuilds from names with no stored state, so both
  need new code:
  - **Merge: keep A's tags; if A is untagged, take B's.**
  - Split: the split-off entry gets a copy of A's tags (same lift).
- `backfillCatalog()` GC (deletes alias-less rows with no Sets/Exercises reference) must skip tagged
  rows. **Rollback caveat:** an older image still runs the old GC and deletes tagged orphans, losing
  their tags. Accepted: an orphan has no history to analyse. Note it in the bundle doc.
- One-off seed from free-exercise-db (confirm the Unlicense before using it) for name matches, shown
  to Jason for review before applying through the PUT. Run it after C1's bulk correction, so names
  and merges have settled. No server-side auto-tagging (§1).
- UI: a third per-row action in `ExerciseCatalogCard.tsx` ("Muscles…") opening a Modal.
- Progress + coach: weekly sets per muscle, plus a flag for muscles untrained 14+ days. Untagged
  lifts still count in volume/heatmap, just not per muscle. Bump `ALLTIME_FORMAT_VERSION`. A
  body-map SVG is later and optional.

**Decide in the bundle doc**
- Does a secondary muscle count ½ a set? Recommend yes (the common convention).

### [ ] C6: Activity heatmap
- Lives **inside Volume Trends** (not a new tab): days in Sun-start weeks, shaded by that day's
  volume through the **same shared `volumeOf`** Progress uses (C3 changes its signature). Reuse
  `localDateKey` / `startOfWeek` from `volumePeriods.ts`. A session that runs past midnight lands on
  its completion day.
- Data is already on the phone: Progress loads `useHistory(1000, 0)` with sets. No new query, no
  schema change.
- "Trained" = the day has a completed session, not volume > 0. Cardio days and assisted-only days
  without a bodyweight both have 0 volume. Any trained day gets at least the lightest shade.
- Tap a day → `/history?sessionId=<id>` (the dashboard Calendar already does this). **Fix the deep
  link first:** when highlighting, `useSessionHistory` loads only ~50 sessions (`useHistory.ts`
  ~11-18), so a session from months ago is never found. Fetch it with `GET /sessions/:id`, or page
  until found. Two sessions on one day: open the most recent; the cell's label says "2 sessions"
  (the Calendar keeps only the first; leave the Calendar as is).
- The existing 12-week bars already show the trend explicitly; no second trend chart.
- No dependency on earlier bundles (volume is computed client-side on every read). It sits last
  before Health Connect because it is the weakest win: the dashboard Calendar, This Week and the
  12-week bars already show most of it. Cut it if it still looks redundant when its turn comes.

**Decide in the bundle doc**
- Width: 53 week columns at ~343 px is ~6 px per cell, too small to tap. Recommend the last 26 weeks
  at a tappable size, with horizontal scroll back to a year.

### [ ] C7: Health Connect write (Android)
- **Depends on C1's `Sessions.updatedAt` bump** (set edits); otherwise no backend change.
- Records: one `ExerciseSessionRecord` per completed session (start `createdAt`, end
  `completedAt`), plus one `HeartRateRecord` from `heartRateSeries` (offsets from `createdAt`; the
  5 s buckets stop at 2000 samples, ~2h47m).
  - Type: strength → `STRENGTH_TRAINING`. A cardio-only session maps by `cardioModality`: running →
    RUNNING, treadmill → RUNNING_TREADMILL, cycling → BIKING_STATIONARY, rowing → ROWING_MACHINE,
    other → OTHER_WORKOUT. Mixed → strength.
  - No strap → session only. No DistanceRecord in v1.
  - Zone offsets per instant from the device zone (DST-safe for backfilled history).
  - Sessions left open for hours: clamp the end to the last set's `createdAt` when the span exceeds
    ~4 h.
- Ids: Health Connect assigns its own record ids.
  - `clientRecordId = wt-<server host>-<sessionId>`, where host is
    `new URL(shellServerUrl() ?? getApiBaseUrl()).host`, so a staging session on the same phone
    can't overwrite a main one. Changing the server URL (IP ↔ domain) changes the ids and duplicates
    history; note it.
  - The HR record gets its own id (`…-hr`), so the two record types never share one.
  - `clientRecordVersion = Date.parse(updatedAt)`. The docs say an existing record is overwritten
    only when the version is higher, and an equal version's behaviour isn't specified. **Verify on
    the Pixel** and never re-insert unchanged sessions.
- **Sync = diff, no tombstones needed.** On app open and after complete:
  - fetch `/sessions/history?limit=2000` (the default limit is 50) and diff `{id → updatedAt}`
    against a local map of written ids
  - write new or changed sessions
  - `deleteRecords` (each record type separately) for mapped ids the server no longer returns

  This covers web edits, web deletes and first-enable backfill (**first enable writes all completed
  history**, ~100 sessions). The map lives in the plugin's SharedPreferences (survives WebView data
  clears; per host, so main and staging don't mix). It needs no HC read permission. Settings gets a
  "Re-sync" button. A History delete on the phone deletes from HC immediately. Discarded
  (incomplete) sessions are never written. If permission is revoked, sync no-ops.
- **Native work** (none of this exists yet):
  - There are no custom Capacitor plugins in the repo, only `MainActivity.java` +
    `ShellInterface.java` (a JS interface) and npm plugins. The existing npm Health plugins don't
    expose `clientRecordId` / session + HR writes, so write a custom plugin.
  - `connect-client` is Kotlin with suspend functions: add the Kotlin Gradle plugin (recommended) or
    bridge from Java.
  - `minSdkVersion` 24 → **26** (HC SDK minimum). Check both phones are Android 8+.
  - Manifest:
    - `health.WRITE_EXERCISE` and `WRITE_HEART_RATE`
    - a `<queries>` entry for `com.google.android.apps.healthdata`
    - a rationale activity for `ACTION_SHOW_PERMISSIONS_RATIONALE`
    - the Android 14+ `VIEW_PERMISSION_USAGE` activity-alias

    Without the rationale activity and alias the permission dialog never shows.
  - Android ≤ 13 needs the HC app; check SDK status (available / needs install) in the UI.
  - `registerPlugin(...)` before `super.onCreate` in `MainActivity`.
- B3 means `ship.sh` delivers UI that may run on an older APK. Gate on
  `Capacitor.isPluginAvailable('HealthConnect')`, **not** the JS proxy (on an old APK it exists but
  throws UNIMPLEMENTED). Hide the feature when the plugin is absent. An old UI on a new APK never
  calls it. Ship the UI first, then `scripts/release-apk.sh`; no hard ordering.
- Behind `isNativeApp()`, with permissions in Settings → Android.

---

## 3. Cross-cutting rules (check in every bundle doc)

- **Compatibility** (CLAUDE.md):
  - New tables are `CREATE TABLE IF NOT EXISTS`.
  - New columns are nullable or have a default.
  - An older image booting on the newer DB is fine: the drizzle migrator applies only migrations
    newer than its latest, and unknown tables/columns are ignored.
  - Rollback is still "old tag, no restore". Note any loss (C5 GC caveat).
- **Old clients:** the API only gains fields and endpoints. Removing the C1 guards is a behaviour
  change no client relies on.
- **Coach memo:** any change to what feeds the all-time block bumps `ALLTIME_FORMAT_VERSION`
  (C1 local day, C3 weigh-ins, C5 muscles).
- **Docs on ship:**
  - CLAUDE.md: the tables rule (now "Eight" after C3, with the C2 and C3 cases), schema diagram, API table, the
    tree (new routes; profile/progression/coach contexts become server-backed), and the Scope line
    (same-instance settings sharing is not cloud sync).
  - `v3-plan.md`: a pointer that v4 reversed the browser-only API key decision.
  - `CHANGELOG.md`: a row per bundle.
