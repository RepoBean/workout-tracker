# v4 Bundle C1: History editing + logging past workouts

Status: **shipped to staging + main 2026-10-15 (`7cc9b04`); wife after a few workouts. Bulk correction (Appendix A) applied to staging + main 2026-10-15.** Decisions: all recommendations (§6). Written 2026-10-15 at `455b026`, from
`docs/v4-plan.md` §2 C1 re-checked against the code that day. Line numbers are from that read.

**Gate:** both vitest suites and `tsc` pass (the one flipped test below is the only existing test
that changes); the new backend tests in §3.5 pass; `api-snapshot` diff on staging before/after is
empty apart from the new `/stats` field; the previous image boots on the new DB (no schema change,
so this is trivially true, but run it anyway).

---

## 1. What it does

- **Edit a completed session**: change weight / reps / RPE (and duration / distance on cardio sets),
  add sets, delete sets, add an exercise, change the date and time.
- **Log a past workout**: pick a date + time and a workout (blank, a program workout, or cardio).
  The server creates the session already completed; it opens straight in the same editor.
- **Bulk correction** afterwards: the reviewed dumbbell / Pull-Up fix from v4-plan §1 (§5 below).
- **Local day**: three places that put an evening session on tomorrow's date are fixed (§4).

No new table, no migration. The API gains one optional field on `/start`, one field on `/stats`
and one endpoint (`PUT /api/sessions/:id`).

---

## 2. What the re-check found (differences from the plan)

| # | Plan said | Code says | This doc |
|---|---|---|---|
| 1 | Coach memo key gets "max session `updatedAt` from history" | The key (`useCoachDossier.ts:100`) reads `useHistory(RECENT_SESSION_COUNT = 20)`. An edit to a session older than the last 20 (which is **exactly** the bulk correction: Apr–Sep dumbbell sets) would not change it, and the all-time block would keep the old numbers | `/stats` gains `lastUpdatedAt` = `max(Sessions.updatedAt)` over completed sessions; the key uses it. Additive field; an older backend omits it and the key just falls back to today's behaviour |
| 2 | Reuse `SetInput` only | `SetInput` reads the session id from `useParams` (`:32`) and saves drafts under `wt:setinput:<sid>:` (`sessionStorage.ts:28`). Those keys are swept only on complete/discard, which an already-completed session never goes through, so they would leak forever | `SetInput` gains an optional `persist={false}` prop (default true, so the live session is unchanged); the editor passes it |
| 3 | Host edit mode on `SessionCard` or `CompletedSessionSummary` | `SessionCard` is a 268-line list item; `CompletedSessionSummary` is rendered from inside the 580-line active-session page (`active-session/index.tsx:439`), next to `useActiveSession` | A new page, `/history/:id/edit` (decision D1) |
| 4 | Host TZ not stated | Host and containers are `Etc/UTC`; compose sets no `TZ` | `TZ` must be named explicitly (decision D3) |
| 5 | — | `GET /sessions/:id` returns the **current** workout definition as `exercises` (`sessions.ts:346`), not what was planned on the day | The editor lists exercises from the session's sets; unlogged program slots appear only as a "Not logged" row (§3.2) |
| 6 | setNumber = max + 1 | Confirmed: `ExerciseCard.tsx:85` uses `standardSets.length + 1`. Left alone in the live session (no deletes mid-list matter there today); the editor uses max + 1 | — |

Everything else in the plan matched: the three guards are at `sessions.ts:460/512/650`; the
`/complete` guard at `:593`; `/history`, `/previous` (`setsByName.ts:45`) and CSV all order by
`completedAt`; `/active` filters `completedAt IS NULL`; `isoDate`s at `dossier.ts:39` and
`liftOverview.ts:51`; `localToday` at `liftTrend.ts:41`, `localDateKey` at `volumePeriods.ts:24`;
CSV date at `sessions.ts:224`; streak at `:276-322`; `useInvalidateCatalogReaders` at
`queries.ts:318`; `useDeleteSession` at `useHistory.ts:40` (invalidates history/stats/calendar
only); `ALLTIME_FORMAT_VERSION = 3`; test "rejects sets on a completed session" at
`sessions.test.ts:76`.

---

## 3. Design

### 3.1 Backend (`routes/sessions.ts`)

- **Remove the three `completedAt` guards** on set POST / PUT / DELETE. Keep `/complete`'s.
- **Bump `Sessions.updatedAt`** in the same transaction on every set POST / PUT / DELETE (DELETE
  moves into a transaction). Shared helper `touchSession(tx, sessionId, ts)`.
- **`POST /start`** schema gains `completedAt: z.string().datetime({ offset: true }).optional()`
  (reject > now + 60 s for clock skew) and `durationMin: z.number().int().min(1).max(600).optional()`
  (default 60). When `completedAt` is present: `createdAt = completedAt − durationMin`,
  `completedAt` set in the insert, `isAdHoc` forced `true`. Both code paths (blank and workout) take
  it. Nothing else changes: the session never appears in `/active`, never goes through `/complete`,
  never advances the rotation.
- **`PUT /api/sessions/:id`** (new): body `{ completedAt }` (same validation). 404 missing; 400 on an
  incomplete session (date edits are for history; an active session has no `completedAt` to move).
  In one transaction: `delta = new − old completedAt`; shift `Sessions.createdAt`, `completedAt`,
  and every `Sets.createdAt` of the session by `delta`; bump `Sessions.updatedAt`. Sets'
  `updatedAt` is left alone (a moved date is a session edit). Returns the session with sets, same
  shape as `GET /:id`.
  - Dates are written through the `sequelizeDate` column, so the text format is preserved. Do the
    shift in JS over the selected rows, not with SQL date arithmetic (the stored text is not a
    format SQLite's date functions read back cleanly).
- **`GET /stats`** gains `lastUpdatedAt` (ISO or null): `max(updatedAt)` over completed sessions.
- **CSV date** (`:224`): local getters, `YYYY-MM-DD`. Correct once `TZ` is set (D3).

### 3.2 Frontend: the editor (`features/history/`)

New route `/history/:id/edit` → `features/history/SessionEditor.tsx` (+ components under
`features/history/components/edit/` if it grows past ~300 lines).

- Loads `useSession(id)` (the same query key the active page uses, so invalidation is shared).
- Header: workout name, a date + time field (`<input type="datetime-local">`, local time, sent as
  `toISOString()`; `max` = now), duration shown read-only.
- One card per exercise **in first-set order** (sets order by id, so a newly added exercise is
  last; accepted in the plan). Each card: the logged sets as rows. Tap a row → inline edit
  (weight, reps, RPE 1-10 chips; cardio rows: duration mm:ss + distance). Swipe left → delete
  (`SwipeableRow`, no confirm, matching the live session). Under the rows, `SetInput` with
  `persist={false}`, prefilled from the card's last set, `setNumber = max(setNumber) + 1` over
  standard sets.
- Strength only gets `SetInput`; a cardio exercise gets "Add cardio set" (duration + distance
  fields). No live timer.
- "Not logged" row (session has a `workoutId`): the program slots with no sets, as chips; tapping
  one adds its card. Program slots come from the current workout definition (finding #5), which is
  right for a just-logged past workout and close enough for an edit.
- "Add exercise": name field with the existing `/exercises/suggestions` autocomplete. Sets go in
  with `exerciseId: null` (ad-hoc convention). No rename.
- Exercise notes: the existing `ExerciseNote` widget per card (endpoint already allowed).
- **None of** the live-session machinery: no HR stamping, rest timer, PR toast, RPE prompt,
  auto-advance, `/previous` or history-by-name hints, ordering/hidden localStorage keys.
- New hook `features/history/hooks/useSessionEdits.ts`: `addSet`, `updateSet`, `deleteSet`,
  `setNote`, `setDate`. Each optimistic on `queryKeys.session(id)` (the established pattern),
  rollback + `toast.error` on failure, and on settle calls the shared invalidation (§3.4).
- Deleting the last set of an exercise: its card goes; its note is cleared through the note
  endpoint (notes are keyed by name).
- Deleting every set: see D2.

**Entry points**
- History: the expanded `SessionCard` gets an **Edit** button beside Delete → `/history/:id/edit`.
- `CompletedSessionSummary` (stale `/workout/:id` link) gets an **Edit** link.
- Dashboard + History: **Log past workout** (History header button; dashboard next to Quick Workout).

### 3.3 Log a past workout + picker refactor

- `AdHocWorkoutPicker` today calls `/start` itself (three paths: blank, workout, cardio). Refactor
  to `onChoose(choice)` with `choice = { kind: 'blank' } | { kind: 'workout', workoutId } |
  { kind: 'cardio', modality }`. The Quick Workout caller keeps today's behaviour exactly.
- `LogPastWorkout` modal: date (default today), time (default 18:00), duration minutes (default 60),
  then the picker. Builds the `Date` from local parts, posts
  `/start { workoutId?, completedAt: d.toISOString(), durationMin }`, invalidates (§3.4) and
  navigates to `/history/:id/edit`. Cardio choice: the editor opens with an empty cardio card for
  that modality's default name.

### 3.4 Caches

One `useInvalidateHistoryReaders()` in `queries.ts`: `useInvalidateCatalogReaders` (catalog,
history, previous, byName, allSets, programs) + `session(id)`, `stats`, `calendarSessionsAll`.
Used by the edit hook, the past-log flow, and **`useDeleteSession`** (which today misses
previous/byName/allSets, so a deleted session's sets keep showing as hints until refetch).

Coach memo key (`useCoachDossier.ts:100`): append `stats.lastUpdatedAt ?? ''` (finding #1).
`ALLTIME_FORMAT_VERSION` 3 → 4 (local day).

### 3.5 Tests

Backend (`sessions.test.ts`):
- flip "rejects sets on a completed session" → accepts POST / PUT / DELETE on a completed session.
- set POST / PUT / DELETE each bump `Sessions.updatedAt`.
- `/start` with `completedAt`: `createdAt = completedAt − duration`, `isAdHoc` true even if `false`
  sent, not in `/active`, program `currentWorkoutIndex` unchanged; future date 400.
- `PUT /:id`: shifts session + set `createdAt` by the delta (duration preserved); 400 future / 400
  incomplete / 404 missing; history order follows the new date.
- `/stats.lastUpdatedAt` moves on a set edit.
- CSV: an evening-Eastern session gets its local date (run with `TZ` set in the test env).

Frontend: `localDateKey` for a 23:30 local timestamp (`dossier`, `liftOverview`); setNumber max + 1
after a mid-list delete; picker `onChoose` mapping; past-log local date → ISO.

---

## 4. Local day

- Move `localToday` (`shared/lib/liftTrend.ts:41`) to `shared/lib/localDate.ts` as
  `localDateKey(d: Date | string)`; `liftTrend` re-exports `localToday` for its callers.
  `volumePeriods.ts:24` imports it instead of its own copy.
- `dossier.ts:39` and `liftOverview.ts:51` `isoDate` → `localDateKey(new Date(value))` (keep
  `'unknown'` for null in the dossier).
- CSV (§3.1) and the `/stats` streak become correct once `TZ` is set (D3). Verify with
  `docker exec workout-tracker-staging-backend node -e 'console.log(new Date().toString())'`.

---

## 5. Bulk correction (after the editor is on main)

1. Claude queries a fresh `scripts/backup.sh main` copy and writes the list: every combined-
   dumbbell set with its proposed halved weight, plus Pull-Up 2026-09-18 / 09-26 `+40 → −40`.
   Session date, exercise, set number, old → new.
2. **Jason approves the list** (edits allowed).
3. Script over `PUT /sessions/:id/sets/:setId` on **staging** (after `seed-staging.sh`), check
   Progress + PRs there.
4. `scripts/backup.sh main`, run on main. Wife: only if her history has the same pattern (check
   with the same query; nothing is applied there without its own list).

---

## 6. Decisions (Jason, 2026-10-15: all recommendations taken)

| # | Question | Recommendation |
|---|---|---|
| D1 | Where the editor lives | **New page `/history/:id/edit`**, entered from History (Edit button) and the stale-link summary. Not inside SessionCard (list item) or the active-session page (entangled with `useActiveSession`) |
| D2 | Deleting every set of a session | **Keep the empty session**, with a "Delete session" button in the editor header (`confirm()`, existing mutation) |
| D3 | CSV date + `/stats` streak timezone | **Set `TZ=America/New_York`** on the three backend services in compose (host is `Etc/UTC`, so it must be named). Alternative: accept UTC |
| D4 | Date-edit bounds | **No future dates, no lower bound** |
| D5 | Cardio sets in the editor | **Editable duration + distance**, add with plain fields (no timer). Alternative: weight/reps/RPE only, cardio read-only |
| D6 | Default duration for a past log | **60 min, editable in the modal** |

---

## 7. Cross-cutting checks (v4-plan §3)

- **Compatibility:** no schema change. API gains `/start.completedAt` + `durationMin`,
  `/stats.lastUpdatedAt`, `PUT /sessions/:id`. Old APK/frontend: unaffected, except that a stale
  tab logging to a session completed elsewhere now succeeds (accepted in the plan). Rollback = old
  tag; edits made meanwhile are just data.
- **Coach memo:** `ALLTIME_FORMAT_VERSION` → 4, key gains `lastUpdatedAt`.
- **Docs on ship:** CLAUDE.md API table (`PUT /api/sessions/:id`, `/start` fields, set routes on
  completed sessions), the tree (`SessionEditor`, `useSessionEdits`, `shared/lib/localDate.ts`),
  Key Features (new "History editing" item), Session Delete note on invalidation. `CHANGELOG.md`
  row. Tick C1 in `v4-plan.md`.
- **Ship:** staging (+ seed) → main → wife, same commit. Bulk correction after main (§5).

## 8. Build notes (2026-10-15)

- **Sets added to a completed session are stamped at its `completedAt`**, not now. Found on
  staging: a set added today to a session backdated to last week sat outside the session's window
  (HR markers, and a later date move shifted it to the wrong day). Live sessions are unchanged.
- **A session that opens with no sets** (a just-logged program workout) shows every program slot
  as a card, seeded once into state so they don't collapse to chips after the first set. Once a
  session has sets, unlogged slots are chips.
- `ExerciseNote` gained `startEditing` / `onCancel` (the "+ Note" button on a card with no note).
- `useQuickWorkout` (dashboard) now holds the Quick Workout start logic the picker used to own.
- Tests: backend 107 (11 new or changed, incl. the parity `/stats` row), frontend 258 (+6 editor
  logic, +1 local date). Staging, headless Pixel 7: log past workout from a program → editor with
  slot cards → log two sets → inline edit reps/RPE → move the date (session + sets shifted, 400
  on future) → History card shows it with Edit; Quick Workout still starts a live session.
  `TZ` check printed `Eastern Daylight Time`. No console errors.

## 9. Build order

1. Backend: guards, `touchSession`, `/start`, `PUT /:id`, `/stats` field, CSV, tests.
2. `shared/lib/localDate.ts` + the two `isoDate`s + memo key/version.
3. `useInvalidateHistoryReaders`, fix `useDeleteSession`.
4. `SetInput persist` prop; `useSessionEdits`; `SessionEditor` page + entry points.
5. Picker refactor + Log past workout.
6. Compose `TZ` (if D3). Ship staging; headless check on 8037; main; wife.
7. Bulk correction (§5).

---

## Appendix A: bulk correction list (APPLIED 2026-10-15)

**Jason, 2026-10-15:** a weight that drops by half means both dumbbells were counted. Dumbbell RDL
was combined from the start (Feb), and 55 → 27.5 is accepted. **Seated DB Overhead Press 06-08
(75 × 3 sets) was a machine press, so it is excluded and left at 75 under its old name.** 127 sets
corrected through the API (each checked against its old weight first): staging, then main after
`main-20261015-201653.sqlite`. Wife: not checked yet.

Original list as reviewed:

Built 2026-10-15 from `main-20261015-195556.sqlite` (pre-deploy backup); dates are local (Eastern).
130 sets. Ranges come from the 2× jumps in the data, so check each:

| Exercise | Range | Sets | Change | Question |
|---|---|---|---|---|
| Low Incline Dumbbell Press | 04-15 → 06-10 | 42 | 60/70/80/90 → 30/35/40/45 | — (25 before, 40 after fits) |
| Seated DB Overhead Press | 05-01 → 06-08 | 15 | 70/75 → 35/37.5 | 37.5 isn't a common dumbbell; ok? |
| Dumbbell RDL | 02-16 → 06-10 | 64 | 50/55/60/70/80 → 25/27.5/30/35/40 | Was it combined **from the start** (Feb), or only from some later date? 27.5 for 04-15/04-17? |
| Bicep Curl | 09-26 | 3 | 40 → 20 | — |
| Pull-Up | 09-18, 09-26 | 6 | +40 → −40 | — |

Left alone: Neutral Grip Pull-Up / Assisted pullups (effective-weight convention, scores correctly
with bodyweight), Dumbbell Bicep Curl 04-29 (25, one session), Dumbbell Shoulder Press 04-29.

Apply: script over `PUT /api/sessions/:id/sets/:setId` with `{ weight }`, keyed by set id
(per-set list below), on staging after `seed-staging.sh`, check Progress/Records, then
`scripts/backup.sh main` and main. Wife: check her data with the same query first.

| Date | Exercise | Set | Reps | Old | New | setId |
|---|---|---|---|---|---|---|
| 2026-04-15 | Low Incline Dumbbell Press | 1 | 10 | 60 | 30 | 1822 |
| 2026-04-15 | Low Incline Dumbbell Press | 2 | 10 | 60 | 30 | 1823 |
| 2026-04-15 | Low Incline Dumbbell Press | 3 | 8 | 60 | 30 | 1824 |
| 2026-04-17 | Low Incline Dumbbell Press | 1 | 12 | 60 | 30 | 1839 |
| 2026-04-17 | Low Incline Dumbbell Press | 2 | 10 | 60 | 30 | 1840 |
| 2026-04-17 | Low Incline Dumbbell Press | 3 | 8 | 60 | 30 | 1841 |
| 2026-04-20 | Low Incline Dumbbell Press | 1 | 10 | 60 | 30 | 1862 |
| 2026-04-20 | Low Incline Dumbbell Press | 2 | 10 | 60 | 30 | 1863 |
| 2026-04-20 | Low Incline Dumbbell Press | 3 | 10 | 60 | 30 | 1864 |
| 2026-04-22 | Low Incline Dumbbell Press | 1 | 10 | 60 | 30 | 1884 |
| 2026-04-22 | Low Incline Dumbbell Press | 2 | 10 | 60 | 30 | 1885 |
| 2026-04-22 | Low Incline Dumbbell Press | 3 | 12 | 60 | 30 | 1886 |
| 2026-04-27 | Low Incline Dumbbell Press | 1 | 10 | 60 | 30 | 1911 |
| 2026-04-27 | Low Incline Dumbbell Press | 2 | 10 | 60 | 30 | 1912 |
| 2026-04-27 | Low Incline Dumbbell Press | 3 | 10 | 60 | 30 | 1913 |
| 2026-04-29 | Low Incline Dumbbell Press | 1 | 8 | 70 | 35 | 1951 |
| 2026-04-29 | Low Incline Dumbbell Press | 2 | 10 | 70 | 35 | 1952 |
| 2026-04-29 | Low Incline Dumbbell Press | 3 | 9 | 70 | 35 | 1953 |
| 2026-05-06 | Low Incline Dumbbell Press | 1 | 12 | 70 | 35 | 2007 |
| 2026-05-06 | Low Incline Dumbbell Press | 2 | 10 | 70 | 35 | 2008 |
| 2026-05-06 | Low Incline Dumbbell Press | 3 | 12 | 70 | 35 | 2009 |
| 2026-05-10 | Low Incline Dumbbell Press | 1 | 10 | 80 | 40 | 2072 |
| 2026-05-10 | Low Incline Dumbbell Press | 2 | 10 | 80 | 40 | 2073 |
| 2026-05-10 | Low Incline Dumbbell Press | 3 | 10 | 80 | 40 | 2074 |
| 2026-05-13 | Low Incline Dumbbell Press | 1 | 10 | 80 | 40 | 2091 |
| 2026-05-13 | Low Incline Dumbbell Press | 2 | 10 | 80 | 40 | 2092 |
| 2026-05-13 | Low Incline Dumbbell Press | 3 | 10 | 80 | 40 | 2093 |
| 2026-05-18 | Low Incline Dumbbell Press | 1 | 12 | 80 | 40 | 2127 |
| 2026-05-18 | Low Incline Dumbbell Press | 2 | 10 | 80 | 40 | 2128 |
| 2026-05-18 | Low Incline Dumbbell Press | 3 | 8 | 80 | 40 | 2129 |
| 2026-05-20 | Low Incline Dumbbell Press | 1 | 13 | 80 | 40 | 2139 |
| 2026-05-20 | Low Incline Dumbbell Press | 2 | 11 | 80 | 40 | 2140 |
| 2026-05-20 | Low Incline Dumbbell Press | 3 | 10 | 80 | 40 | 2141 |
| 2026-05-26 | Low Incline Dumbbell Press | 1 | 7 | 90 | 45 | 2175 |
| 2026-05-26 | Low Incline Dumbbell Press | 2 | 6 | 90 | 45 | 2176 |
| 2026-05-26 | Low Incline Dumbbell Press | 3 | 7 | 90 | 45 | 2177 |
| 2026-05-28 | Low Incline Dumbbell Press | 1 | 10 | 80 | 40 | 2189 |
| 2026-05-28 | Low Incline Dumbbell Press | 2 | 10 | 80 | 40 | 2190 |
| 2026-05-28 | Low Incline Dumbbell Press | 3 | 10 | 80 | 40 | 2191 |
| 2026-06-10 | Low Incline Dumbbell Press | 1 | 12 | 80 | 40 | 2230 |
| 2026-06-10 | Low Incline Dumbbell Press | 2 | 8 | 80 | 40 | 2231 |
| 2026-06-10 | Low Incline Dumbbell Press | 3 | 8 | 80 | 40 | 2232 |
| 2026-05-01 | Seated DB Overhead Press | 1 | 8 | 70 | 35 | 1970 |
| 2026-05-01 | Seated DB Overhead Press | 2 | 8 | 70 | 35 | 1971 |
| 2026-05-01 | Seated DB Overhead Press | 3 | 8 | 70 | 35 | 1972 |
| 2026-05-08 | Seated DB Overhead Press | 1 | 10 | 70 | 35 | 2057 |
| 2026-05-08 | Seated DB Overhead Press | 2 | 8 | 70 | 35 | 2058 |
| 2026-05-08 | Seated DB Overhead Press | 3 | 8 | 70 | 35 | 2059 |
| 2026-05-15 | Seated DB Overhead Press | 1 | 8 | 70 | 35 | 2115 |
| 2026-05-15 | Seated DB Overhead Press | 2 | 8 | 70 | 35 | 2116 |
| 2026-05-15 | Seated DB Overhead Press | 3 | 6 | 70 | 35 | 2117 |
| 2026-05-22 | Seated DB Overhead Press | 1 | 10 | 70 | 35 | 2160 |
| 2026-05-22 | Seated DB Overhead Press | 2 | 8 | 70 | 35 | 2161 |
| 2026-05-22 | Seated DB Overhead Press | 3 | 8 | 70 | 35 | 2162 |
| 2026-06-08 | Seated DB Overhead Press | 1 | 10 | 75 | 37.5 | 2213 |
| 2026-06-08 | Seated DB Overhead Press | 2 | 8 | 75 | 37.5 | 2214 |
| 2026-06-08 | Seated DB Overhead Press | 3 | 6 | 75 | 37.5 | 2215 |
| 2026-02-16 | Dumbbell RDL | 1 | 8 | 50 | 25 | 1350 |
| 2026-02-16 | Dumbbell RDL | 2 | 8 | 50 | 25 | 1352 |
| 2026-02-16 | Dumbbell RDL | 3 | 7 | 50 | 25 | 1354 |
| 2026-02-18 | Dumbbell RDL | 1 | 6 | 50 | 25 | 1380 |
| 2026-02-18 | Dumbbell RDL | 2 | 6 | 50 | 25 | 1382 |
| 2026-02-18 | Dumbbell RDL | 3 | 7 | 50 | 25 | 1384 |
| 2026-02-23 | Dumbbell RDL | 1 | 9 | 50 | 25 | 1426 |
| 2026-02-23 | Dumbbell RDL | 2 | 8 | 50 | 25 | 1428 |
| 2026-02-23 | Dumbbell RDL | 3 | 7 | 50 | 25 | 1430 |
| 2026-02-27 | Dumbbell RDL | 1 | 8 | 50 | 25 | 1476 |
| 2026-02-27 | Dumbbell RDL | 2 | 8 | 50 | 25 | 1478 |
| 2026-02-27 | Dumbbell RDL | 3 | 8 | 50 | 25 | 1480 |
| 2026-03-06 | Dumbbell RDL | 1 | 8 | 50 | 25 | 1596 |
| 2026-03-06 | Dumbbell RDL | 2 | 8 | 50 | 25 | 1598 |
| 2026-03-06 | Dumbbell RDL | 3 | 8 | 50 | 25 | 1601 |
| 2026-03-16 | Dumbbell RDL | 1 | 8 | 50 | 25 | 1641 |
| 2026-03-16 | Dumbbell RDL | 2 | 8 | 50 | 25 | 1643 |
| 2026-03-16 | Dumbbell RDL | 3 | 8 | 50 | 25 | 1645 |
| 2026-03-18 | Dumbbell RDL | 1 | 8 | 50 | 25 | 1668 |
| 2026-03-18 | Dumbbell RDL | 2 | 8 | 50 | 25 | 1670 |
| 2026-03-18 | Dumbbell RDL | 3 | 6 | 50 | 25 | 1672 |
| 2026-04-03 | Dumbbell RDL | 1 | 10 | 50 | 25 | 1739 |
| 2026-04-03 | Dumbbell RDL | 2 | 9 | 50 | 25 | 1740 |
| 2026-04-03 | Dumbbell RDL | 3 | 7 | 50 | 25 | 1741 |
| 2026-04-08 | Dumbbell RDL | 1 | 10 | 50 | 25 | 1784 |
| 2026-04-08 | Dumbbell RDL | 2 | 8 | 50 | 25 | 1785 |
| 2026-04-08 | Dumbbell RDL | 3 | 8 | 50 | 25 | 1786 |
| 2026-04-15 | Dumbbell RDL | 1 | 8 | 55 | 27.5 | 1814 |
| 2026-04-17 | Dumbbell RDL | 1 | 8 | 55 | 27.5 | 1842 |
| 2026-04-17 | Dumbbell RDL | 2 | 8 | 55 | 27.5 | 1843 |
| 2026-04-17 | Dumbbell RDL | 3 | 8 | 55 | 27.5 | 1844 |
| 2026-04-27 | Dumbbell RDL | 1 | 8 | 60 | 30 | 1923 |
| 2026-04-27 | Dumbbell RDL | 2 | 8 | 60 | 30 | 1924 |
| 2026-04-27 | Dumbbell RDL | 3 | 8 | 60 | 30 | 1925 |
| 2026-04-29 | Dumbbell RDL | 1 | 8 | 70 | 35 | 1948 |
| 2026-04-29 | Dumbbell RDL | 2 | 8 | 70 | 35 | 1949 |
| 2026-04-29 | Dumbbell RDL | 3 | 8 | 70 | 35 | 1950 |
| 2026-05-04 | Dumbbell RDL | 1 | 8 | 70 | 35 | 1997 |
| 2026-05-04 | Dumbbell RDL | 2 | 10 | 70 | 35 | 1998 |
| 2026-05-04 | Dumbbell RDL | 3 | 8 | 70 | 35 | 1999 |
| 2026-05-06 | Dumbbell RDL | 1 | 8 | 70 | 35 | 2010 |
| 2026-05-06 | Dumbbell RDL | 2 | 10 | 70 | 35 | 2011 |
| 2026-05-06 | Dumbbell RDL | 3 | 8 | 70 | 35 | 2012 |
| 2026-05-10 | Dumbbell RDL | 1 | 10 | 80 | 40 | 2075 |
| 2026-05-10 | Dumbbell RDL | 2 | 8 | 80 | 40 | 2076 |
| 2026-05-10 | Dumbbell RDL | 3 | 8 | 80 | 40 | 2077 |
| 2026-05-13 | Dumbbell RDL | 1 | 10 | 80 | 40 | 2094 |
| 2026-05-13 | Dumbbell RDL | 2 | 8 | 80 | 40 | 2095 |
| 2026-05-13 | Dumbbell RDL | 3 | 8 | 80 | 40 | 2096 |
| 2026-05-18 | Dumbbell RDL | 1 | 10 | 80 | 40 | 2130 |
| 2026-05-18 | Dumbbell RDL | 2 | 10 | 80 | 40 | 2131 |
| 2026-05-18 | Dumbbell RDL | 3 | 10 | 80 | 40 | 2132 |
| 2026-05-20 | Dumbbell RDL | 1 | 8 | 80 | 40 | 2142 |
| 2026-05-20 | Dumbbell RDL | 2 | 8 | 80 | 40 | 2143 |
| 2026-05-20 | Dumbbell RDL | 3 | 8 | 80 | 40 | 2144 |
| 2026-05-26 | Dumbbell RDL | 1 | 8 | 80 | 40 | 2178 |
| 2026-05-26 | Dumbbell RDL | 2 | 7 | 80 | 40 | 2179 |
| 2026-05-26 | Dumbbell RDL | 3 | 8 | 80 | 40 | 2180 |
| 2026-05-28 | Dumbbell RDL | 1 | 8 | 80 | 40 | 2192 |
| 2026-05-28 | Dumbbell RDL | 2 | 8 | 80 | 40 | 2193 |
| 2026-05-28 | Dumbbell RDL | 3 | 8 | 80 | 40 | 2194 |
| 2026-06-10 | Dumbbell RDL | 1 | 10 | 80 | 40 | 2233 |
| 2026-06-10 | Dumbbell RDL | 2 | 10 | 80 | 40 | 2234 |
| 2026-06-10 | Dumbbell RDL | 3 | 10 | 80 | 40 | 2235 |
| 2026-09-26 | Bicep Curl | 1 | 8 | 40 | 20 | 2866 |
| 2026-09-26 | Bicep Curl | 2 | 6 | 40 | 20 | 2867 |
| 2026-09-26 | Bicep Curl | 3 | 5 | 40 | 20 | 2868 |
| 2026-09-18 | Pull-Up | 1 | 8 | 40 | -40 | 2813 |
| 2026-09-18 | Pull-Up | 2 | 8 | 40 | -40 | 2814 |
| 2026-09-18 | Pull-Up | 3 | 8 | 40 | -40 | 2815 |
| 2026-09-26 | Pull-Up | 1 | 10 | 40 | -40 | 2854 |
| 2026-09-26 | Pull-Up | 2 | 8 | 40 | -40 | 2855 |
| 2026-09-26 | Pull-Up | 3 | 8 | 40 | -40 | 2856 |
