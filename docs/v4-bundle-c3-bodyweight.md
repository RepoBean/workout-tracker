# v4 Bundle C3: Bodyweight log

Status: **building; decisions in §6 (Jason 2026-10-16).** Written 2026-10-15 at `0c2e3ec`, from `docs/v4-plan.md`
§2 C3 re-checked against the code that day. Line numbers are from that read.

**Gate:** both vitest suites and `tsc` pass; the new backend tests (§4.4) and the lookup tests pass;
`api-snapshot` diff on staging before/after is empty apart from the new `bodyweights` file; the
previous image (`9d163b3`) boots on the migrated DB and ignores the new table; with a weigh-in
logged on staging, the assisted Pull-Up numbers in History, Progress, Records and the coach dossier
agree between a phone and a browser.

---

## 1. What it does

- A dated bodyweight log (one weigh-in per local day) on the instance's server, logged and charted
  from a new **Body** tab in Progress.
- Every assisted-lift figure (volume, 1RM, PRs, Progress, coach all-time) uses the bodyweight **on
  that session's day** instead of one profile value applied to all of history.
- The profile `bodyweight` (per device, never synced) is retired as a source: it stays in
  localStorage only as the last-resort fallback (no weigh-ins at all, or an older backend). The
  Settings field now logs a weigh-in.
- The coach's athlete line gains the date and a 90-day change.

Live data that this touches: main has 12 assisted sets (Pull-Up, all −40), wife 3 (Assisted
Pull-Up). Small, but every one of them is currently scored against whatever each device has typed.

---

## 2. The written case for table 8 (`BodyWeights`)

CLAUDE.md requires one before a new table. Bodyweight today is one number in per-device
localStorage, so (a) the phone and the browser can score the same assisted set differently, and
(b) changing it rewrites every past assisted-lift 1RM and PR, because there is no history of it.
It is a time series of training-adjacent data, not configuration, so it doesn't belong in
`Settings` (one JSON value per key, last write wins, no per-row edits). It has no relation to any
existing table: a weigh-in is not a session (no sets, no program, not in the rotation, the
streak or History). The smallest shape is one row per local day: id, date, weight, timestamps.
Additive, ignored by older images.

---

## 3. Re-check: differences from the plan

| # | Plan said | Code says | This doc |
|---|---|---|---|
| 1 | `effectiveWeight()` call sites: 13 | Confirmed (grep at `0c2e3ec`): `liftOverview.ts:73`, `exerciseIndex.ts:161,299`, `dossier.ts:221`, `StrengthDetail.tsx:88`, `SessionCard.tsx:77,226`, `usePrCelebration.ts:41`, `personalRecord.ts:30`, `setVolume` in `active-session/index.tsx:266`, `CompletedSessionSummary.tsx:19`, `useProgressData.ts:77` | One lookup, built once per query result and passed down (§4.2) |
| 2 | `computeBestOneRepMax`'s input drops `completedAt` | Confirmed (`personalRecord.ts:15-22`); `ExerciseAllSet` already carries it | Widen the input type with `completedAt` |
| 3 | `volumeOf(set)` has only the set | Confirmed (`volumePeriods.ts:25,36-46`) | `VolumeOf = (set, completedAt) => number`; `sessionVolume` passes `s.completedAt` |
| 4 | Memo key's `bodyweight` part → weigh-ins fingerprint | Key is at `useCoachDossier.ts:102` | `bw:<count>:<max updatedAt>:<fallback>`; the fallback (profile value) stays in because it's still used with no weigh-ins. Bump `ALLTIME_FORMAT_VERSION`. The dossier waits for the weigh-ins query like it waits for stats |
| 5 | Athlete line at dossier.ts ~390 | `:391`, `buildAthleteLine(profile, progression, today)` | Takes the weigh-ins; line format §4.2 |
| 6 | C2 → "Six" tables in §3 | CLAUDE.md now says Seven | "Seven" → "Eight", citing this doc |
| 7 | — | `ProgressChart.formatDate` does `new Date(dateString)`; a bare `YYYY-MM-DD` parses as **UTC** midnight and would label every weigh-in a day early in ET | Feed the chart `YYYY-MM-DDT12:00:00` (local noon) |
| 8 | Dismissal flag in the server `profile` | `settings.ts` profile schema strips unknown fields; adding it is a C2 schema change | Only if D1 = prompt (§6) |

---

## 4. Design

### 4.1 Backend

**Table** (`schema.ts`, migration `0005_bodyweights` via `drizzle-kit generate --name=bodyweights`;
reviewed, `CREATE TABLE IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS`):

```
BodyWeights (id INTEGER PK, date TEXT NOT NULL /* local YYYY-MM-DD */, weight REAL NOT NULL /* lbs */,
             createdAt, updatedAt)   UNIQUE(date)
```
Dates `createdAt`/`updatedAt` are `sequelizeDate`. `date` is a plain calendar-day string, not an
instant.

**Router** `routes/bodyweights.ts` at `/api/bodyweights`:
- `GET /` → all rows `{ id, date, weight, createdAt, updatedAt }[]`, sorted by `date` ascending
  (small: one row per day at most; no paging).
- `POST /` `{ date, weight }` → **upsert on `date`** (same day again overwrites the weight and bumps
  `updatedAt`). 201 on insert, 200 on overwrite; returns the row.
- `PUT /:id` `{ date?, weight? }` (at least one) → 404 missing; moving onto another row's date → 409.
- `DELETE /:id` → 204 / 404.
- Zod: `date` a real calendar date (regex + round-trip), not after **tomorrow** server-local (the
  backends run `TZ=America/New_York`; one day of slack for a phone in another zone); `weight` 50–700
  (same as `PROFILE_LIMITS.bodyweight`), decimals allowed.
- No catalog, no session coupling, not in the CSV or program export.

### 4.2 Frontend

**Data**
- `queryKeys.bodyweights`, `useBodyweights()` (staleTime like catalog), mutations
  `useLogWeighIn` / `useUpdateWeighIn` / `useDeleteWeighIn` following the Mutation Hook pattern,
  invalidating `bodyweights` only (every derived number is computed from the query, so it refreshes).
- On a 404 (older backend, rollback) the query resolves to `[]` silently, so everything falls back
  to the profile value: the pre-C3 behaviour.

**Lookup** — `shared/lib/bodyweight.ts` (pure, + tests):
```ts
bodyweightLookup(weighIns, fallback): (completedAt: string | null) => number | null
```
- `completedAt` → `localDateKey()` first (never compare the raw UTC string). The latest weigh-in on
  or before that day; else the **earliest** weigh-in; else `fallback` (profile value).
- `null` (the session in progress) → the latest weigh-in, else fallback.
- Sorted once; binary search per call.
- `useBodyweightLookup()` (same file's hook sibling in `shared/api/queries.ts`) wires
  `useBodyweights()` + `useUserProfile().profile.bodyweight`, memoized on both.

**Call sites** (§3 #1): each takes `bodyweightAt` instead of `bodyweight: number | null`, and calls
it with the session's `completedAt`:
- `liftOverview.ts`, `exerciseIndex.ts` (both), `dossier.ts` `rollupExercises`/`buildAllTimeBlock`,
  `StrengthDetail.tsx`, `SessionCard.tsx`, `CompletedSessionSummary.tsx`, `useProgressData.ts`
  (`volumeOf` gets the date, §3 #3).
- Active session (`index.tsx:266` volume, `usePrCelebration` new set): `bodyweightAt(null)`.
  `computeBestOneRepMax(sets, bodyweightAt)` scores each historical set at its own date.
- `setVolume(set, bodyweight)` and `effectiveWeight(weight, bodyweight)` keep their signatures; only
  the caller decides which bodyweight.

**Progress → Body tab** (4th tab: Exercises / Volume / Records / Body; the chip row already
scrolls):
- "Log weigh-in": number input (lbs, prefilled with the latest) + date (default today, local).
  Logging an existing date overwrites it (says so under the date field).
- `ProgressChart` over the weigh-ins with the 3M/6M/1Y/All `RangeSelector` (default 6M, All when
  6M has < 2 points, same rule). Points fed at local noon (§3 #7).
- Summary line: latest weight + date, change over 30 and 90 days.
- List below, newest first: tap to edit inline (weight, date), swipe-to-delete with `confirm()`.
- Empty state explains what it's for ("Used for assisted lifts: …"). No prompt (D1).

**Settings → Profile** (D1)
- The bodyweight field stays editable and is prefilled with the latest weigh-in (else the device's
  profile value). Saving the profile with a changed value POSTs a weigh-in for today and also keeps
  the local profile value in step (the rollback fallback). Hint text: "Logged as today's weigh-in ·
  history in Progress → Body".
- On an older backend (weigh-ins query 404) it saves locally only, as before C3.

**Coach** (`dossier.ts`)
- Athlete line: `bodyweight 182.4 lb (2026-10-10), −4 lb over 90 d`. The change is latest minus the
  latest weigh-in on or before (latest date − 90 d); if none is that old, minus the earliest, with
  its real span (`over 34 d`); a single weigh-in has no change part. With no weigh-ins:
  `bodyweight 185 lb` from the fallback, as today.
- The persona line about assisted lifts says "bodyweight on that day".
- Memo key and `ALLTIME_FORMAT_VERSION`: §3 #4.

### 4.3 Scripts

- `backup.sh:41` / `restore.sh:35` count lists: + `BodyWeights` when present.
- `api-snapshot.sh`: + `bodyweights` (`GET /api/bodyweights`). Weigh-ins carry no secrets.
- `seed-staging.sh`: unchanged (weigh-ins copy over with main's data, that's fine).

### 4.4 Tests

Backend (`test/bodyweights.test.ts`): empty GET; POST insert → 201, same date → 200 and overwrites
(one row, `updatedAt` bumped); sorted GET; PUT weight / date; PUT onto another date → 409; DELETE;
404s; validation (49.9, 700.1, `2026-02-30`, the day after tomorrow, non-numeric) → 400.
Migrations test: 8 tables, 6 migrations; the old-image-on-new-DB check still passes.

Frontend:
- `bodyweight.test.ts`: on/before, before-first (earliest), no weigh-ins (fallback, and null
  fallback), `null` completedAt (latest), **an 11 pm ET session on the day of a next-morning
  weigh-in uses the previous one** (UTC string would get it wrong), exact-day match.
- Existing suites (`liftOverview`, `exerciseIndex`, `dossier`, `volumePeriods`, `personalRecord`)
  move from a number to a lookup; add one case each where two sessions straddle a weigh-in.
- `dossier.test.ts`: the athlete line's three shapes.

---

## 5. Compatibility and rollback

- New table `IF NOT EXISTS`, no column changes. API gains four routes; nothing removed.
- Rollback to `9d163b3`: the table is ignored; that image's UI is served, which reads the device's
  profile `bodyweight` (never deleted by C3), so numbers go back to pre-C3 behaviour. Weigh-ins
  logged meanwhile are kept and reappear on roll-forward.
- New UI on an older backend can't happen in normal use (B3 serves the UI from the same server), but
  the 404 path covers it anyway.

---

## 6. Decisions (Jason, 2026-10-16)

| # | Question | Decision |
|---|---|---|
| D1 | First weigh-in | **No prompt, no dismissal flag.** Settings → Profile keeps an editable bodyweight field; saving it **logs a weigh-in for today** (upsert). The field shows the latest weigh-in. Until anything is logged, the device's old profile value is the silent fallback, so nothing changes on upgrade. C2's profile schema is untouched |
| D2 | Where the log lives | **Progress → Body tab** (chart, history list, add/edit/delete incl. past dates) |
| D3 | Weigh-in dates | Any past date up to tomorrow (backfill from the Body tab) |
| D4 | Sessions before the first weigh-in | **Use the earliest weigh-in** (backfill), as planned |

## 7. Cross-cutting checks (v4-plan §3)

- Additive table; older image ignores it; rollback = old tag, no restore, no loss.
- API only gains routes.
- Coach memo: weigh-ins fingerprint in the key + `ALLTIME_FORMAT_VERSION` bump.
- Docs on ship: CLAUDE.md tables rule ("Seven" → "Eight", citing this doc), schema diagram, API
  table, tree (`routes/bodyweights.ts`, `shared/lib/bodyweight.ts`, Progress `BodyTab`), Assisted
  Lifts row + Key Feature 19 ("profile bodyweight" → "bodyweight on that day"), UserProfileContext
  note (bodyweight = fallback only); `CHANGELOG.md` row; tick C1–C3 in `v4-plan.md`.

---

## 8. Build notes (2026-10-16)

- Backend 125 tests (+8), frontend 288 (+16; also run under `TZ=America/New_York`).
- `ExerciseSession` (Progress strength history) carries the session's `bodyweight`, so StrengthDetail's
  "eff" label needs no lookup of its own; StrengthDetail lost its `bodyweight` prop.
- The coach dossier waits for the weigh-ins query (success or error) so it is never pinned with the
  fallback by accident.
- `SwipeableRow` now renders its red layer only while swiping: at rest it antialiased through the
  rounded corners as pink arcs (visible on the Body tab list and History cards).
- Stale C2 copy fixed on the way: Settings → Profile said "Stored locally on this device", the AI coach
  card said the key is stored "in this browser only".
- Staging checks (2026-10-16): api-snapshot diff = only the new `bodyweights.json`; Settings save of 185
  logged today's weigh-in and the server profile still has no bodyweight; Body tab backfill (Jun 1 195),
  chart, inline edit, a date clash → 409 toast; with weigh-ins Jun 1 195 / Sep 28 190, History shows the
  −40 Pull-Ups as 155 eff on Sep 18/26 and 150 eff on Sep 30/Oct 7; `9d163b3` boots on the migrated DB
  (102 sessions, `/api/bodyweights` 404). Swipe-delete not driven headless (API delete is tested).

## 9. Build order

1. Backend: schema + migration, router, tests, scripts.
2. `shared/lib/bodyweight.ts` + tests; queries + mutations.
3. Thread the lookup through every call site; update the existing suites.
4. Progress Body tab; Settings read-only field.
5. Coach athlete line, memo key, version bump.
6. Docs. Ship staging → seed → check phone + browser → main → (wife, see note).
