# v3 Bundle 2 — Exercise catalog (plan + results)

Written 2026-09-14 from a read-only survey of the repo at `34983c1` (B0 merged) plus fresh backups
of `main` (`main-20260914-234435.sqlite`: 90 sessions / 1,634 sets / 136 exercise rows) and `wife`
(`wife-20260914-234950.sqlite`: 54 / 997 / 74) taken that evening. Companion to `docs/v3-plan.md`
§4 Bundle 2. This is the **one new table v3 allows**: `ExerciseCatalog`, plus a nullable
`catalogId` on `Exercises` and `Sets`. Names stay on every row. Nothing about the API contract
changes except that responses gain a field and three new catalog endpoints appear.

**Gate:** the existing 74 backend + 121 frontend tests keep passing unchanged (the by-name
characterization tests from Bundle 1 *are* the lock on this bundle); `api-snapshot` diff on
staging is empty once the new `catalogId` field is stripped; the old image boots on the new DB.

---

## 1. Facts that shape the design (measured 2026-09-14)

### 1.1 The names, as they actually are

| Measure | main | wife |
|---|---|---|
| Distinct raw names in `Sets` / in `Exercises` | 49 / 51 | 32 / 25 |
| Distinct raw names, union | **65** | **34** |
| Distinct after `lower(trim())` | 65 | 34 |
| Case / whitespace variants of the same name | **0** | **0** |
| Near-duplicates after normalizing punctuation, spacing, DB→Dumbbell, BB→Barbell | **1** pair | 0 |
| Same token set in a different order | 0 | 0 |
| Names only in history (logged, no program row anywhere) | 14 | 9 |
| Names only in programs (never logged) | 16 (8 are test junk) | 2 |
| Sets with `exerciseId = NULL` (ad-hoc adds, swaps, deleted exercises) | 364 (22%) | — |
| Sets whose `exerciseId` row has a *different* name than the set | 0 | — |
| Dangling `exerciseId` | 0 | — |
| Non-ASCII names | 0 | 0 |
| Cardio sets (`durationSec` set) | 3 ("Ride" ×2, "Treadmill") — none has a program row | — |
| Sessions with `exerciseNotes` | 4 (keys: Neutral Grip Pull-Up, Leg Curl Machine, Hip Abduction Machine ×2, Leg Press) | — |

The one true near-duplicate is the known rename split:

| Name | Sets | Logged | Program rows (live / archived) |
|---|---|---|---|
| Low Incline Dumbbell Press | 63 | 2026-04-03 → 2026-06-22 | 2 / 2 |
| Low Incline DB Press | 47 | 2026-06-26 → 2026-09-11 | 2 / 0 |

Everything else that *might* be the same lift is a judgment call only Jason can make — the
backfill must not guess at any of these:

- Leg Curl (45, since Jun) vs Leg Curl Machine (68, Jan–Jun)
- Bicep Curl (33) vs Dumbbell Bicep Curl (3) vs Bicep Curl Machine (10) vs Bicep Curls (0, program only)
- Seated DB Overhead Press (36) vs Dumbbell Shoulder Press (3) vs Shoulder Press Machine (91)
- Cable Row (61) vs Wide bar cable row (3) vs Mst row (3) vs Seated Row Machine (84)
- Hip abduction (6, Jan 29 only) vs Hip Abduction Machine (131)
- Neutral Grip Pull-Up (101) vs Assisted pullups (3) vs Pull-ups (0, program only)
- wife: Triceps press (12) vs Triceps extension (3)

Top of the set-count table (main): Leg Press 135, Hip Abduction Machine 131, Neutral Grip
Pull-Up 101, Lat Pulldown Machine 95, Dumbbell RDL 94, Shoulder Press Machine 91, Seated Row
Machine 84, Goblet Squat 72, Chest Press Machine 71, Leg Curl Machine 68, Low Incline Dumbbell
Press 63, Cable Row 61. The 14 history-only names are one-offs (3 sets each, plus Glute kick 6,
Ride 2, Treadmill 1). The 8 junk program-only names (abbs, ass, butt, test1–4, Bicep Curls…)
live in archived test programs 2, 5, 6, 7, 13–16.

**Consequences.** (a) Case-folding in the backfill is future-proofing, not a data need — zero
variants on either instance. (b) `lower(trim())` is the *only* automatic grouping rule; the
DB/Dumbbell pair and every other candidate above go through the merge tool by hand. (c) The
"same lift renamed" problem is real but small: one split, 110 sets. (d) Every name in `Sets`
needs a catalog row regardless of whether a program row exists (22% of sets have no
`exerciseId`, 14 names have no program row at all) — the catalog is keyed off *names*, not
`Exercises`. (e) 16 never-logged names get rows too; they are harmless and the UI sorts by
name with counts, so junk is visible but inert.

### 1.2 Every place history is joined by exercise name (26 sites; the plan guessed ~18)

Sites marked **switch** move to `catalogId` in this bundle; **keep** stay name-based (with the
reason). Line numbers are at `34983c1`.

| # | Site | What it does | This bundle |
|---|---|---|---|
| 1 | `backend/src/db/queries/setsByName.ts:9` (`nameMatches`), `:27` `latestSetsByName`, `:59` `allStandardSetsByName` | `lower(exerciseName) = lower(?)` over Sets | **switch** (server-side, API unchanged): resolve name → catalog row (name or alias) → `WHERE catalogId = ?`; fall back to the name equality when the name is unknown |
| 2 | `backend/src/routes/sessions.ts:362-366` `/sessions/:id/previous` | per workout exercise, `latestSetsByName(exercise.name)` | **switch**: use `exercise.catalogId` directly |
| 3 | `backend/src/routes/exercises.ts:74` `/history-by-name` | ad-hoc "last time" hint | **switch** via #1 |
| 4 | `backend/src/routes/exercises.ts:99` `/all-sets-by-name` | PR check | **switch** via #1 |
| 5 | `backend/src/routes/exercises.ts:116-135` `/suggestions` | distinct `LIKE` over `Exercises.name` ∪ `Sets.exerciseName` | keep — the catalog ⊇ both sources, and re-sourcing would reorder the snapshot for no gain; Bundle 5 |
| 6 | `backend/src/routes/sessions.ts:550-555` `/exercise-note` | JSON keyed by name | keep — Bundle 3 moves notes onto `SessionExercises` |
| 7 | `backend/src/routes/sessions.ts:224` CSV export | emits the logged name | keep — display of what was logged |
| 8 | `backend/src/routes/sessions.ts:526-527` PUT set re-point | swap carry-over writes `exerciseName` + `exerciseId:null` | **write path**: re-resolve `catalogId` from the new name |
| 9 | `frontend/src/features/progress/hooks/useProgressData.ts:96-97, 110-111` | picker names + most-trained, keyed by `set.exerciseName` | **switch** |
| 10 | `useProgressData.ts:159-160, 179` | cardio names; `getExerciseHistory` filters `set.exerciseName === name` | **switch** |
| 11 | `useProgressData.ts:248` | `getCardioExerciseHistory` | **switch** |
| 12 | `useProgressData.ts:426-468` | personal records maps keyed by name | **switch** |
| 13 | `progress/components/ExerciseProgressTab.tsx:27,103,113,162`, `PersonalRecordsTab.tsx:65,145` | `selectedExercise` is a name; PR sort/key by name | **switch** (display names come from the catalog) |
| 14 | `frontend/src/features/coach/lib/dossier.ts:112-116` `renderSession` | per-session grouping by name | keep — shows what was logged, in that session |
| 15 | `dossier.ts:169-189` `rollupExercises` | all-time rollup keyed by `set.exerciseName` | **switch**: key by `catalogId ?? name`, display the catalog name |
| 16 | `coach/lib/tools.ts:102-104, 147-148` `matchesExercise` | case-insensitive substring | keep — it is a search, and the "matched N names" note still helps; add catalog match later if needed |
| 17 | `active-session/hooks/usePrCelebration.ts:37, 43-47` | session ref keyed by lowercased name; fetches #4 | keep the ref (session-local); history comes merged via #4 |
| 18 | `active-session/index.tsx:240-251` | ad-hoc hint via `useExerciseHistoryByName(name)` (#3) | keep — history comes merged via #3 |
| 19 | `active-session/hooks/useAdHocExercises.ts:115-128, 134-145, 180-185, 201, 220-231` | groups null-id sets of *this session* by `lower(name)` | keep — session-local by design; Bundle 3 replaces with `SessionExercises` |
| 20 | `active-session/hooks/useExerciseNavigation.ts:177, 189, 214, 233, 252` | same, for progress/complete checks | keep — same reason |
| 21 | `active-session/hooks/useActiveSession.ts:181, 205, 232-261` | RPE bulk update + `moveSets` select by name | keep — same reason |
| 22 | `active-session/hooks/useRpeFlow.ts:51` | find exercise by name for null-id sets | keep |
| 23 | `history/components/SessionCard.tsx:69, 99-103` | per-session grouping + exercise count | keep — display of what was logged |
| 24 | `shared/api/queries.ts:222-232` | optimistic `exerciseNotes[name]` | keep (see #6) |
| 25 | `active-session/lib/sessionStorage.ts:36`, `components/CardioSetInput.tsx:59` | localStorage keys by `lower(name)` | keep — transient, session-scoped |
| 26 | `program-builder/components/ExerciseForm.tsx:145-146`, `AddExercise.tsx:25`, `SwapExercise.tsx:20` | consumers of #5 | keep |

Summary: **4 server sites + 5 frontend sites switch**; the rest are per-session display or
transient state that Bundle 3 is the right place to change. The switched set is exactly "the
things that should see a renamed lift as one lift": previous hints, ad-hoc hints, PR check,
Progress, coach all-time block.

### 1.3 Facts about the mechanics

| Fact | Consequence |
|---|---|
| `drizzle-kit generate` (0.31) for a new FK column on SQLite emits `ALTER TABLE \`Sets\` ADD \`catalogId\` integer REFERENCES ExerciseCatalog(id);` — verified by a dry run on a scratch copy of the schema. No table rebuild. It **drops `ON DELETE/ON UPDATE`** (SQLite default `NO ACTION`). | The migration is pure `CREATE TABLE` + `ADD COLUMN` + `CREATE INDEX`: existing DDL text changes only by the appended column, and the old image keeps running on it. Declare the reference in `schema.ts` *without* actions so schema and DDL agree (D2 explains why `NO ACTION` is what we want anyway). |
| SQLite allows `ADD COLUMN … REFERENCES` with `foreign_keys = ON` only when the default is NULL. | `catalogId` is nullable with no default. Fine. |
| drizzle-kit cannot express expression indexes (same as `0001`). | The case-insensitive unique index is a `--custom` migration `0003`. |
| Drizzle's migrator applies journal entries whose `folderMillis` is newer than the last row in `__drizzle_migrations`. An image whose journal ends at `0001` sees a DB whose last row is `0003` and applies nothing. | Rollback to `34983c1` needs no restore. (Rehearse on staging, D6.) |
| Sequelize image `1aeebcc` runs a plain `sync()` (no `alter`, no `force`) — `CREATE TABLE IF NOT EXISTS`. | Extra table + extra nullable columns are invisible to it. Wife (still on `1aeebcc`) is not shipped in this bundle; when she is, `0000`–`0003` apply in order on one boot. |
| `lower()` in SQLite is ASCII-only. | All 99 names on both instances are ASCII. A non-ASCII name would simply be its own entry. |
| The frontend already downloads the full history for Progress and the coach; Sets rows gain one ~16-byte field. | ~26 KB on the 636 KB payload. Bundle 5 shrinks it; not this bundle's problem. |
| Old APK (B0 build) sends `POST /sets {exerciseId, exerciseName, …}` and reads `Set`/`Exercise` objects. | Request schemas do **not** gain `catalogId`; the server derives it from the name. Responses gain a field the old APK ignores. |
| `test/app.ts` `resetDb()` deletes the 5 tables with FKs off. | Add `ExerciseCatalog` to the list. `toMatchObject` shape tests tolerate the new key; any `toEqual` on a whole row needs `catalogId` added. |

---

## 2. Decisions

**D1 — Table: `ExerciseCatalog(id, name, aliases, createdAt, updatedAt)`.** PascalCase like the
other five; "catalog" matches the FK name `catalogId` and the bundle name. Columns:

| Column | Type | Why it is in |
|---|---|---|
| `id` | integer PK autoincrement | |
| `name` | text NOT NULL, **unique on `lower(name)`** (index `catalog_name_lower`, migration 0003) | the canonical display name for Progress / dossier |
| `aliases` | text JSON `string[]` NOT NULL default `'[]'` | consumer: the name → catalog resolver on every write, and the merge/split tool. One table only, so aliases cannot be rows |
| `createdAt`, `updatedAt` | `sequelizeDate` | same convention as the other tables; `updatedAt` also fingerprints the coach dossier cache |

**Dropped from the plan's list — no consumer in this bundle:** `movementPattern`, `equipment`
(nothing reads them; the persona still tells the model to classify itself — it needs an edit UI
first), `isAssisted`/bodyweight (Bundle 4 decides between the flag and sign-as-notation),
`defaultRestSec` (needs a `TimerContext` consumer), `archived` (no list filters on it; junk rows
are inert and sort to the bottom by count). Each is a one-line `drizzle-kit generate` when its
consumer arrives; adding columns speculatively just creates dead schema.

**D2 — `catalogId` on `Exercises` and `Sets`: nullable, `REFERENCES ExerciseCatalog(id)` with
SQLite's default `NO ACTION`, indexes `exercises_catalog_id` / `sets_catalog_id`. Names stay on
every row** (`Exercises.name`, `Sets.exerciseName` are untouched, still NOT NULL, still what the
UI shows in sessions and history). `NO ACTION` is deliberate: a catalog row that history
references cannot be deleted, so "never delete history's identity" is enforced by the DB, not by
handler discipline. The merge deletes the folded row only after re-pointing inside the same
transaction; GC deletes only unreferenced rows.

Invariant (soft, self-healing): every `Exercises`/`Sets` row's `catalogId` resolves from its own
name or an alias of that catalog row. It is NULL only transiently — rows written by an old image
during a rollback window — and the next boot fixes them (D3).

**D3 — Migration and backfill.**
- `0002_exercise_catalog` (generated; the exact SQL is in §1.3's dry run: table, two `ADD COLUMN`,
  two indexes) and `0003_catalog_name_lower_unique` (custom: `CREATE UNIQUE INDEX IF NOT EXISTS
  catalog_name_lower ON ExerciseCatalog (lower(name))`). DDL only. The generated SQL is kept
  as-is, no `IF NOT EXISTS` edits — `0000` is the only baseline.
- **The backfill is not in the migration. It is `backfillCatalog(sqlite)` in `src/db/catalog.ts`,
  run at every boot** as stage 3 of `bootstrap()` (after `migrate()`), inside one transaction,
  three set-based statements:
  1. Insert a catalog row for every distinct `lower(trim(name))` across `Sets.exerciseName` ∪
     `Exercises.name` that is not already a catalog name or alias. Canonical spelling: the
     spelling with the most `Sets` rows; tie → a spelling on an `Exercises` row in a non-archived
     program; tie → lowest row id. (Live: zero variants on either instance, so today this is
     simply "the name". The rule exists so a future `leg press` typed on the phone folds into
     `Leg Press` instead of becoming a second entry.)
  2. `UPDATE Sets/Exercises SET catalogId = <resolved> WHERE catalogId IS NULL` (name or alias,
     via `lower(trim())`).
  3. GC: delete catalog rows referenced by no `Sets`, no `Exercises`, and with `aliases = '[]'`
     — typo leftovers (rename a fresh exercise before logging it) and rows orphaned by a
     cascade-deleted workout. Rows with aliases are kept: they carry merge history.
  It is idempotent by construction (every statement is a no-op on a converged DB), logs counts
  only when non-zero, and costs a few ms on 1,634 sets (indexed `catalogId IS NULL` scans).
  Why boot, not a one-shot script: it also heals rows written by an old image while rolled back,
  and any client that writes names the resolver did not see; there is nothing to remember to
  run; and it is the same code the tests exercise. Expected first boot on main: `+65 catalog
  rows, 1634 sets, 136 exercises resolved`; every boot after: silent.
- **Write-time resolution.** `resolveCatalogId(tx, name)` — find by `lower(name) = lower(trim(?))`
  or by alias (`json_each`), else insert a row named `trim(name)` — is called on: `POST /sets`,
  `PUT /sets/:id` when `exerciseName` is present, `POST /exercises`, `PUT /exercises/:id` when
  `name` is present, program import, program duplicate, workout duplicate (copies could just
  copy the id; resolving keeps one code path). **Request schemas do not accept `catalogId`.**
  The name is authoritative, the id is derived. That is what keeps the old APK correct: it sends
  exactly what it sends today and its sets come back resolved. A rename of a program exercise
  therefore resolves to a *new* catalog row when the new name is unknown — a rename is "this
  slot now does a different exercise"; "same lift, new spelling" is the merge tool (D4). No
  magic.

**D4 — Merge tool semantics.** `POST /api/catalog/:id/merge { fromId }` folds B (`fromId`) into A
(`:id`), in one transaction: re-point `Sets` and `Exercises` from B to A; `A.aliases` gains
`B.name` and all of `B.aliases`; delete B (now unreferenced, so `NO ACTION` allows it). 400 if
`fromId === id`, 404 if either is missing. It never touches `Sets.exerciseName`,
`Exercises.name`, or `Session.exerciseNotes` — history shows what was logged; only *identity*
moves. After the merge, a program exercise still named B sends name B on every set → resolves
via the alias → A.
- **Reversible: `POST /api/catalog/:id/split { alias }`** creates a new row named `alias`,
  re-points every `Sets`/`Exercises` row with `lower(trim(name)) = lower(alias)` to it, and
  removes the alias from A. Because names never left the rows, the split is exact — this is the
  answer to "what if I merge the wrong thing" that is better than "restore a backup".
- Merge direction chooses the surviving display name (fold the old spelling into the one in the
  current program). A rename endpoint is therefore not needed in this bundle.
- `GET /api/catalog` → `[{ id, name, aliases, setCount, exerciseCount, createdAt, updatedAt }]`
  sorted by name. The two counts are a `GROUP BY` — a read the UI needs and the v3 rewrite of
  "dumb backend" explicitly allows (derived reads). No `POST`/`PUT`/`DELETE /catalog`: rows only
  ever come from names on rows, and only merge/split/GC remove them.
- The backend stays dumb: three validated writes (Zod on `fromId`, `alias`) and one list. All
  judgement about *what* to merge is Jason's, in the UI.

**D5 — Expand/contract.** Expand = D1–D3 (additive schema, resolver on writes, boot backfill,
`catalogId` in responses). Contract in this bundle = the **switch** rows of §1.2:
- Server: `setsByName.ts` resolves the queried name through the catalog and filters on
  `catalogId`; `/previous` uses `exercise.catalogId`. API shape unchanged; results identical
  until a merge exists, then merged. Fallback to the old name equality when a name is not in the
  catalog (cannot happen after the backfill; keeps `?name=garbage` behaving as today).
- Frontend: Progress groups by `catalogId ?? exerciseName` and displays catalog names; the coach
  all-time rollup does the same; the dossier memo key gains a catalog fingerprint
  (`count:maxUpdatedAt`) so a merge recomputes the block.
- Everything marked **keep** stays by name until Bundle 3 (session structure) or Bundle 5
  (derived reads) has a reason to touch it. The expression index `sets_exercise_name_lower`
  stays: the fallback path and `split` use it.

**D6 — Rollback story.** Same property as Bundle 1: **old tag, no restore.** `34983c1` (Drizzle,
journal ends at `0001`) boots on a `0003` DB and applies nothing; `1aeebcc` (Sequelize) ignores
the extra table and columns. Sets and exercises the old image writes have `catalogId NULL`; the
first boot of the new image afterwards backfills them. Rehearsed on staging in §3 step 8 before
`main` is touched. Nothing in this bundle rewrites or drops anything.

**D7 — UI: Settings → "Exercise catalog" card.** A list sorted by name (so near-duplicates sit
next to each other: "Bicep Curl / Bicep Curl Machine / Bicep Curls", "Leg Curl / Leg Curl
Machine", "Low Incline DB Press / Low Incline Dumbbell Press"), each row showing the name, alias
chips, and `N sets · M program exercises`. Row action **"Merge into…"** opens a `Modal` with a
filterable list of the other entries; picking one runs `confirm()` with the counts ("Move 63 sets
and 4 program exercises from 'Low Incline Dumbbell Press' into 'Low Incline DB Press'? The old
name becomes an alias.") then the mutation. Alias chips have **"Split off"** (`confirm()`).
Mutations invalidate `catalog`, `history`, `previousSession`, `exerciseHistoryByName`,
`exerciseAllSets`, `programs`. No duplicate-detection heuristics; alphabetical adjacency and the
counts are enough for 65 rows. Established patterns only (mutation hook, `confirm()`, Modal,
toast).

---

## 3. Work breakdown (in order)

### Step 0 — Characterization tests on the frontend read paths that switch
Pure functions first, so the switch is a diff on tested code, not on a 500-line hook.
- Extract the grouping/records math out of `useProgressData.ts` into
  `features/progress/logic/exerciseIndex.ts` (`buildExerciseIndex(sessions, catalog)`,
  `strengthHistory`, `cardioHistory`, `personalRecords`) with the hook becoming a thin
  `useMemo` wrapper. **Tests written against the current name-keyed output** on a fixture built
  from the live shape (two names, cardio + strength, drop sets, an incomplete session): the
  extracted functions must reproduce it exactly with an empty catalog map. Then the switch adds
  one test: two names sharing a `catalogId` become one series under the catalog name.
- `dossier.test.ts` (27 tests) stays green with no catalog map (fallback to names); add one
  merged-id case for `rollupExercises`/`buildAllTimeBlock`.
- Backend: the Bundle 1 parity tests for `/previous`, `/history-by-name`, `/all-sets-by-name`
  (`parity.test.ts:260-330`) are the characterization; they are not edited.

### Step 1 — Schema + migrations + migration tests
- `schema.ts`: `exerciseCatalog` table; `catalogId` on `exercises` and `sets` with `references()`
  and no actions; indexes; relations (`catalog: one(...)`) — no relational includes are needed
  yet, but the types come for free.
- `npx drizzle-kit generate --name=exercise_catalog` → `0002`; `--custom --name=catalog_name_lower_unique`
  → `0003`. Commit `drizzle/` incl. `meta/`.
- `migrations.test.ts`: (a) fresh DB → 6 tables, `catalogId` in both column lists, 4 migrations
  recorded, second `bootstrap()` no-op; (b) live DDL fixture → additions are exactly
  `__drizzle_migrations`, `sets_exercise_name_lower`, `ExerciseCatalog`, `catalog_name_lower`,
  `exercises_catalog_id`, `sets_catalog_id`; `Sets` and `Exercises` DDL equal the fixture text
  plus the appended column; **every other object byte-identical**; (c) pre-legacy fixture → still
  converges. `test/app.ts` `resetDb()` gains the table.

### Step 2 — `src/db/catalog.ts`: resolver + backfill (tests first)
- `resolveCatalogId(tx, name)` and `backfillCatalog(sqlite)` as in D3; `bootstrap()` calls the
  backfill after `migrate()`.
- `catalog.test.ts` replays the live DDL and a fixture derived from §1.1: names in Sets only,
  Exercises only (archived and live programs), both; null-`exerciseId` sets; synthetic case and
  whitespace variants (`leg press`, ` Leg Press`) that do not exist live but the rule must
  handle; cardio sets. Asserts: one row per `lower(trim())`; canonical spelling rule (most sets,
  then live program row, then lowest id); every row resolved; **second run changes nothing**
  (row count, ids, `updatedAt`); a set inserted with `catalogId NULL` and an unknown name (the
  old-image case) gets a new row on the next run; GC removes an unreferenced alias-less row and
  keeps one with aliases; resolver matches by alias and trims.

### Step 3 — Backend routes
- Write paths call the resolver (D3 list). `sessions.ts` `PUT /sets/:id` re-resolves when
  `exerciseName` is present — the swap carry-over test gains an assertion on `catalogId`.
- `setsByName.ts`: resolve the name to a catalog id first; `WHERE catalogId = ?`; fallback to the
  existing `lower()` predicate when unresolved. `/previous` passes `exercise.catalogId`.
- New `routes/catalog.ts`: `GET /`, `POST /:id/merge`, `POST /:id/split` (D4), mounted at
  `/api/catalog`. Tests: list with counts; merge re-points both tables, adds aliases (including
  B's own aliases), deletes B, 400/404 cases, alias uniqueness (an alias may not equal an
  existing name or alias → 409); a set logged under B's name after the merge resolves to A;
  `history-by-name?name=<B's name>` returns the merged latest; `all-sets-by-name` returns the
  union; `/previous` for a workout exercise that is a copy under B's name; split restores the
  pre-merge state exactly (counts and ids of re-pointed rows).
- CORS/health untouched. `types/index.ts` untouched (Bundle 6 deletes it).

### Step 4 — Frontend
- `shared/api/types.ts`: `catalogId: number | null` on `Exercise` and `Set`; `CatalogEntry`.
  `makeVirtualExercise` sets `catalogId: null`. Fixtures in existing tests gain the field.
- `shared/api/queries.ts`: `queryKeys.catalog`, `useCatalog()`, `useMergeCatalog()`,
  `useSplitCatalog()` (mutation-hook pattern, invalidations per D7).
- Progress: hook consumes `useCatalog()` and the Step-0 functions; `selectedExercise` remains a
  display string, resolved to a group key internally. Records tab keys by the group key.
- Coach: `rollupExercises(sessions, catalogNames)`; `useCoachDossier` adds the catalog
  fingerprint to `cacheKey`. The pinned-ref behaviour (byte-identical text per conversation) is
  untouched.
- Settings: `features/settings/components/ExerciseCatalogCard.tsx` (D7), under the existing
  cards.

### Step 5 — Scripts and docs
- `scripts/api-snapshot.sh`: optional `WT_SNAPSHOT_STRIP=catalogId` (comma list) that drops those
  keys recursively before writing, so before/after diffs can be run across this bundle; plus a
  post-check that prints how many `sets`/`exercises` objects in `history-all.json` and
  `programs.json` have a null `catalogId` (must be 0 on the new image).
- `CLAUDE.md`: Sacred Rules "Tables 5 maximum" → 6 with the v3 note; schema diagram gains
  `ExerciseCatalog` + `catalogId` lines and a Key Patterns row; API table gains the three catalog
  endpoints and the `catalogId` note on sets/exercises; backend tree gains `db/catalog.ts`,
  `routes/catalog.ts`; frontend tree gains the Progress logic file and the Settings card;
  changelog row. Tick Bundle 2 in `docs/v3-plan.md`. Append §7 here. Memory: `project_v3_direction`.

### Step 6 — Ship (the §6 loop, with the extra checks this bundle needs)
1. `scripts/seed-staging.sh` (fresh copy of main). Staging is on `f896358` — API-identical to
   `34983c1` (the B0 fixes after it are frontend-only), so it serves as the "old image".
2. `WT_SNAPSHOT_STRIP=catalogId scripts/api-snapshot.sh staging before/` (the env is a no-op on
   the old image; it keeps both runs on one code path).
3. `scripts/ship.sh staging` → boot log shows `0002`, `0003` applied and the backfill line with
   the expected counts (+65 rows / 1634 / 136) → snapshot to `after/` → **`diff -r before after`
   must be empty**; null-`catalogId` post-check must be 0. Repeat the snapshot once more after a
   container restart to prove the backfill is silent and the diff still empty.
4. **Merge rehearsal on staging's copy:** fold the *old* spelling into the one in the current
   program — `POST /catalog/<Low Incline DB Press id>/merge {fromId: <Low Incline Dumbbell Press
   id>}`. Then: `all-sets-by-name?name=Low Incline DB Press` returns 110 (was 47);
   `…?name=Low Incline Dumbbell Press` also 110 (alias);
   `history-by-name` for either name returns the 2026-09-11 session's sets; `/previous` for the
   active program's session; Progress on 8037 shows one series from April; coach dossier
   all-time block shows one line. Then `split` → snapshot again → diff against `after/` empty
   (proves exact reversibility on real data).
5. Write lifecycle on staging as the **old APK** would: `curl POST /sets` with `exerciseId` +
   `exerciseName` only → response carries `catalogId`; a brand-new name → new catalog row in
   `GET /catalog`; swap carry-over `PUT` re-points the id; delete the session.
6. **Rollback rehearsal:** `scripts/rollback.sh staging 34983c1` (no `--restore`) → boots, serves
   history/previous/hints identically; start a session and log a set (its `catalogId` is NULL in
   the DB); `scripts/ship.sh staging` again → boot log shows `1 set resolved`; the set has an id
   via the API. Then also `rollback.sh staging 1aeebcc` (Sequelize) once, same checks, roll
   forward.
7. Progress and Settings smoke on 8037 in the browser (and the Android app pointed at 8037,
   which is what the dev build already targets).
8. `scripts/ship.sh main`. **Not wife** (she stays on `1aeebcc` until Bundle 1 + 2 go together,
   days later, per the loop).

---

## 4. Parity checklist (what must be provably unchanged)

- [ ] All 74 backend tests and 121 frontend tests pass with zero assertion edits (fixtures may
      gain `catalogId`).
- [ ] `api-snapshot` diff (with `catalogId` stripped) empty before/after on staging, and again
      after a restart, and again after merge → split.
- [ ] Every `Set`/`Exercise` in every read endpoint has a non-null `catalogId` on the new image.
- [ ] Request schemas unchanged: `POST/PUT /sets`, `POST/PUT /exercises`, import, start, complete
      accept exactly what they accept today (the old APK is the client of record).
- [ ] `exerciseName`, `Exercises.name`, `exerciseNotes` are never rewritten by any path in this
      bundle (grep the diff for writes to those columns: only the pre-existing swap re-point).
- [ ] Old image boots and serves on the new DB (both `34983c1` and `1aeebcc`).
- [ ] Coach dossier text is byte-identical before/after for the same data when no merge exists
      (the catalog name equals the set name for every row on a fresh backfill).

## 5. Risks

- **The Progress refactor** touches the hook every tab depends on. Mitigation: Step 0 extracts
  and pins current behaviour before any key changes; the hook shrinks to a wrapper.
- **`NO ACTION` FK** means a `DELETE` of a referenced catalog row throws. Only merge (after
  re-pointing, same transaction) and GC (unreferenced by query) delete rows, so the throw is a
  bug detector, not a user-facing error.
- **Alias collisions.** Merge/split validate that a name never appears twice across
  `name` ∪ `aliases` (409). The unique index covers names; aliases are checked in the handler
  under the transaction.
- **Coach prompt cache** invalidates once after a merge (all-time block changes). Expected and
  cheap.
- **Backfill on a very large DB** is set-based SQL; the `catalogId IS NULL` scans are indexed.
  Nothing here is per-row JS.
- **Junk catalog rows** (8 from archived test programs) stay until those programs are hard-deleted
  — there is no hard-delete path, and hand-editing the live DB is forbidden. They cost nothing.

## 6. Out of scope (later bundles)
No `SessionExercises`, no server-side Progress/dossier (Bundle 5), no suggestions re-sourcing,
no catalog rename/create/delete endpoints, no movement-pattern/equipment/assisted/rest columns,
no changes to `exerciseNotes`, no wife deploy, no Node/Docker bumps.

---

## 7. Results

_(appended after Stage 2 ships)_
