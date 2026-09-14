# v3 Bundle 1 — Drizzle swap (plan + results)

Written 2026-09-13 from a read-only survey of the repo at `1aeebcc` (Step Zero shipped) plus the
live `main` and `wife` backups taken that day. Companion to `docs/v3-plan.md` §4 Bundle 1. This is a
**pure refactor**: same 5 tables, same column names, same API. The only visible changes are the two
full-table-scan endpoints getting faster and `?from=garbage` on `/history` becoming a 400.

**Gate (Jason, 2026-09-12):** the backend HTTP tests keep passing. Everything below serves that.

---

## 1. Facts that shape the design (measured 2026-09-13)

| Fact | Consequence |
|---|---|
| Live DDL (both instances) is Sequelize's: `VARCHAR(255)`, `TINYINT(1)`, `DECIMAL(6,2)`, `DATETIME`, FKs with `ON DELETE CASCADE / SET NULL ON UPDATE CASCADE`, 11 named indexes (`sets_session_id`, `exercises_workout_id_order_index`, …). Column *order* differs between main and wife (`Sets.dropIndex` was added by ALTER on main, inline by sync on wife). | Baseline must be a no-op on existing DBs, not a comparison. `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` with the **same index names**. Fresh-DB DDL may differ cosmetically (SQLite affinities only). |
| Dates are stored as **text** in Sequelize's format: `2026-09-11 16:10:29.104 +00:00` (createdAt, updatedAt, completedAt). API emits ISO (`…T16:10:29.104Z`) because Sequelize hands `res.json` a `Date`. | A custom Drizzle column type that reads *and writes* this exact format. Not `integer({mode:'timestamp'})`. Keeps the DB readable by the old image (rollback without restore) and the API byte-identical. |
| `/history?from&to` and `/active` compare `completedAt`/`createdAt` against caller strings. Calendar sends full ISO (`2026-09-01T04:00:00.000Z`), coach sends `YYYY-MM-DD` and `YYYY-MM-DDT23:59:59.999Z`. Sequelize silently reformatted them to the storage format. | Route must `new Date(param)` → storage format before comparing (text compare works: fixed-width UTC). Invalid → 400 (today: undefined behaviour the coach already guards against client-side). |
| Booleans stored as integer 0/1; `exerciseNotes` is plain JSON text; `heartRateSeries` is a JSON *string* the frontend parses itself; `weight`/`distance` are integer or real (never text). | `integer({mode:'boolean'})`, `text({mode:'json'})`, plain `text()`, `real()`. All map 1:1 to today's JSON output. |
| `PRAGMA foreign_key_check` is clean on both live DBs; journal mode is `delete`. | Turn `foreign_keys = ON` in better-sqlite3 (off by default) and let SQLite do the cascades the DDL already declares. Sequelize did them app-side via `hooks: true`. Leave journal mode alone in this bundle. |
| Host Node is **18.20.7** (nvm). Docker image `node:20-slim`. CI node 20. `better-sqlite3@13` needs Node ≥22, `@12` needs 20–26, `@11` still supports 18. `drizzle-orm` stable is **0.45.2**; 1.0 is beta-only. | See decision D1. |
| `scripts/lib/snapshot.js` (used by `backup.sh`, hence nightly cron, `ship.sh`, `seed-staging.sh`) does `require('sqlite3')` **inside the running container**. | Must work against both the old and new image during the rollout window (staging/main on Drizzle while wife is still on Sequelize for days). |
| Backend tests are HTTP-level (supertest) **except** seed helpers and 3 inspections that call Sequelize models directly (`Program.create` ×6, `Workout.create` ×4, `Exercise.create` ×3, `Exercise.findOne`, `Session.findByPk`, `Session.bulkCreate`), plus two type imports from `types/associations.ts`. | Test files change only in those helper lines. Every `request(app)…expect` stays byte-identical; verify with `git diff`. |
| Every insert/update path already runs a Zod schema (`validate()`); the Sequelize model-level `validate: {min,isIn,len}` rules are redundant. | Dropping model validation loses nothing. (Bundle 6 makes Zod the single source officially.) |
| `backend/seed.ts` and `backend/scripts/import_legacy.ts` are Sequelize-only dev utilities with no references from any script or docs. | Delete `import_legacy.ts` (one-off from January). Rewrite `seed.ts` on Drizzle only if `start-dev.sh` needs it — it doesn't; delete it too. |

---

## 2. Decisions (D1 needs Jason; the rest are recommendations I'll follow unless told otherwise)

**D1 — Node version. Decided 2026-09-14:** host is on Node 22 (nvm default). `better-sqlite3@^12` (prebuilt binaries for 20 and 22); add `backend/.nvmrc` + `frontend/.nvmrc` = `22`. Docker stays `node:20-slim` and CI stays 20 **in this bundle** (one variable at a time); bumping both to 22 is a one-line follow-up.

**D2 — Drizzle line.** `drizzle-orm@^0.45` + `drizzle-kit@^0.31`, relational queries v1 (`relations()` in schema). Not the 1.0 beta.

**D3 — Migration mechanism.** drizzle-kit SQL migrations in `backend/drizzle/`, applied at startup by `migrate()` from `drizzle-orm/better-sqlite3/migrator`, recorded in `__drizzle_migrations`. Startup order:
1. `legacyColumns()` — the current 14-entry `addColumnIfMissing` list, now **guarded by "table exists"** (so it's skipped on a fresh DB). Keeps a pre-June DB upgradeable; no-op on both live DBs.
2. `migrate()` — `0000_baseline.sql` (generated by drizzle-kit, hand-edited to `IF NOT EXISTS`; no-op on existing DBs, full create on fresh) then `0001_sets_name_lower_index.sql` (see D5).
3. The old `sequelize.sync()` is gone; the baseline is what creates tables now.

**D4 — Date column.** `customType` `sequelizeDate`: `dataType() → 'DATETIME'`, `toDriver(Date) → 'YYYY-MM-DD HH:MM:SS.SSS +00:00'`, `fromDriver(string) → Date` by rewriting to `YYYY-MM-DDTHH:MM:SS.SSSZ` first (don't rely on V8 parsing the `+00:00` form). Timestamps set explicitly: `createdAt`+`updatedAt` on insert, `updatedAt` on every update (helper `touch()`).

**D5 — The one schema addition.** `CREATE INDEX IF NOT EXISTS sets_exercise_name_lower ON Sets (lower(exerciseName))` as migration 0001. It's invisible to the app, harmless to the old image, and it makes the first real migration run on live data a trivially reversible one — proving the runner end-to-end before Bundle 2 needs it for a new table. `lower()` is ASCII-only; all 2,631 live set names are ASCII.

**D6 — Query style.** Relational queries (`db.query.programs.findMany({ with: { workouts: { with: { exercises }, orderBy } } })`) for every Sequelize `include`; core builder for the rest. Nested output shape matches `toJSON()` exactly. better-sqlite3 is synchronous, so handlers that no longer await anything drop `async`.

**D7 — Test DB.** Keep `test/setup.ts` (`DB_PATH=':memory:'`) as the only switch; `src/db/index.ts` reads it at import like `models/index.ts` does today. `resetDb()` = `DELETE FROM` the 5 tables + `sqlite_sequence` (ids restart at 1, as `sync({force:true})` did). Drop `pool: 'forks'` from vitest config.

---

## 3. Work breakdown (in order)

### Step 0 — Characterization tests, written against Sequelize first
Lock in behaviour that is implicit today, so the swap has to reproduce it. All must be green on the old stack before any dependency changes.
- DELETE session removes its sets; DELETE workout removes its exercises and nulls `Session.workoutId`; DELETE exercise nulls `Set.exerciseId`; DELETE program cascade (via hard delete path? — no: programs are soft-deleted; skip).
- `PUT` bumps `updatedAt`; `POST` sets both timestamps; JSON dates are ISO `Z` strings.
- `/history?from=<ISO>&to=<ISO>` and `?from=YYYY-MM-DD` inclusive-day semantics (the coach's verified `T23:59:59.999Z` case).
- `/sessions/:id/previous` and `/exercises/history-by-name` are case-insensitive and return the most recent completed session's standard sets only.
- Response shape snapshots for one program-with-workouts-with-exercises and one session-with-sets (`toMatchObject` on keys present, incl. `createdAt`/`updatedAt`).

### Step 1 — Dependencies and Node
- `npm i drizzle-orm better-sqlite3 && npm i -D drizzle-kit @types/better-sqlite3`; `npm rm sequelize sqlite3`.
- `.nvmrc` files (`22`). Host Node 22 via nvm — **done 2026-09-14** (`nvm alias default 22`; both suites green on it). `scripts/ship.sh`: source nvm if present and `nvm use` the `.nvmrc`, then `die` if `node` major < 20 — so a non-interactive invocation can't fall through to the apt Node 18 at `/usr/bin/node`.
- `backend/drizzle.config.ts` (dialect `sqlite`, schema `./src/db/schema.ts`, out `./drizzle`).

### Step 2 — Schema and connection
- `src/db/schema.ts`: 5 tables, exact column names, indexes with today's names, FKs with today's `onDelete`/`onUpdate`, `relations()` for programs↔workouts↔exercises, sessions↔sets, workouts↔sessions, exercises↔sets. Exported row types (`Program = typeof programs.$inferSelect`) replace the model attribute interfaces; `types/associations.ts` is deleted.
- `src/db/columns.ts`: `sequelizeDate` custom type + format helpers (`toStorage(Date)`, `fromStorage(string)`), unit-tested against the literal live sample `2026-09-11 16:10:29.104 +00:00`.
- `src/db/index.ts`: open `DB_PATH` (default `./database.sqlite`), `pragma('foreign_keys = ON')`, export `db`.
- Delete `src/models/`.

### Step 3 — Migrations
- `src/db/migrate.ts`: `bootstrap()` = legacy columns (table-guarded) → `migrate(db, { migrationsFolder })` with the folder resolved from `import.meta.url` (`../../drizzle` works from both `src/` under tsx and `dist/` under node).
- `drizzle-kit generate` → `0000_baseline.sql` + `meta/`; hand-edit SQL to `IF NOT EXISTS` (the journal/snapshot are what future diffs use; the SQL text is only executed). Custom migration `0001` for the expression index.
- Replace `test/migrations.test.ts` with three cases: (a) fresh in-memory DB → all 5 tables with every expected column, `__drizzle_migrations` has 2 rows, second `bootstrap()` is a no-op; (b) DB created from the **literal live main DDL** (paste `sqlite_master` text as a fixture) → `bootstrap()` changes nothing in `sqlite_master` except adding `__drizzle_migrations` + the new index; (c) same fixture minus the 14 late columns → `bootstrap()` adds them, then baseline no-ops.
- `src/index.ts`: `bootstrap()` replaces `sequelize.sync()` + `runMigrations()`; SIGTERM closes the better-sqlite3 handle.

### Step 4 — Routers (same files, same routes, same status codes)
- `programs.ts`: list/get/export/duplicate/import/set-active/archive. `set-active` transaction → `db.transaction(tx => …)`, "not found" from `.run().changes === 0`.
- `workouts.ts`: get/create/update/delete/duplicate/reorder/reorder-exercises.
- `exercises.ts`: `suggestions` (`selectDistinct` + `like`, limit 10 each source), `history-by-name`, `all-sets-by-name`, CRUD.
- `sessions.ts`: history (RQB with `limit`/`offset` on parents, sets ordered by `id`), active, export-csv, stats (JS week logic untouched), get, previous, start, sets CRUD, exercise-note, complete (transaction: complete + advance index), delete.
- New shared helper `src/db/queries/setsByName.ts`: one SQL for "standard sets from completed sessions where `lower(exerciseName) = lower(?)`, ordered by `completedAt DESC, setNumber ASC`", used by `/previous` (loop over the workout's exercises, or one `IN` query), `history-by-name`, and `all-sets-by-name`. This is the fix for the two full-table loads.
- Date-bound parsing helper for `/history` and `/active` (D4); invalid `from`/`to` → 400 with the existing `Validation failed` shape.

### Step 5 — Test harness
- `test/app.ts`: builds the app from the routers (unchanged), `resetDb()` per D7, plus tiny seed helpers (`seedProgram`, `seedWorkout`, `seedExercise`, `insertSessions`) that the four test files call instead of `Model.create`. The two `Session.findByPk`/`Exercise.findOne` inspections become `db.select`. Type imports from `associations.ts` → response types.
- Gate check: `git diff --stat backend/test` shows only helper lines; grep confirms zero changed `request(app)` lines.

### Step 6 — Container and scripts
- `Dockerfile.backend`: add `COPY --from=builder /app/drizzle ./drizzle`. Keep the python3/make/g++ layer (better-sqlite3 downloads a prebuilt binary and only compiles as a fallback).
- `scripts/lib/snapshot.js`: try `require('better-sqlite3')` (sync API, ~15 lines) and fall back to `require('sqlite3')` — both drivers in one file until wife is on the new image, then drop the sqlite3 branch in a later cleanup. Test both paths: run it against the current main container (sqlite3) and against the new staging container (better-sqlite3).
- Delete `backend/seed.ts`, `backend/scripts/import_legacy.ts`.

### Step 7 — Docs
- `CLAUDE.md`: Tech Stack row (Drizzle + better-sqlite3), Sacred Rules "no migrations framework" → "drizzle-kit SQL migrations in `backend/drizzle/`, applied at boot", backend tree (`db/`, `drizzle/`), changelog line. Tick Bundle 1 boxes in `docs/v3-plan.md` and note the rollback property.
- `README.md` only if it names Sequelize (check).

### Step 8 — Ship (the §6 loop, with two extra checks specific to this bundle)
1. `scripts/seed-staging.sh` (fresh copy of main).
2. **API parity snapshot on the OLD image**: new `scripts/api-snapshot.sh <instance> <outdir>` — curls a fixed list of GETs (`programs?includeArchived=true`, `sessions/history?limit=2000`, `sessions/stats`, `sessions/:id` for the 5 newest, `exercises/history-by-name` + `all-sets-by-name` for the 5 most common names, `exercises/suggestions?q=pr`, `sessions/export-csv`), pipes JSON through `jq -S`, writes one file per call.
3. `scripts/ship.sh staging` → boot log shows the baseline no-op and index 0001 applied → snapshot again → `diff -r` the two snapshot dirs must be **empty** (stats is date-dependent; run both within the same day).
4. On staging: start a session, log/edit/delete a set, set a note, complete; check `/active`, `/previous`, history. Then **rollback rehearsal**: `scripts/rollback.sh staging <previous tag>` with **no** `--restore` → the Sequelize image must boot on the Drizzle-touched DB and serve the session just logged. Then roll forward again.
5. `scripts/ship.sh main` (canary, you). `scripts/ship.sh wife` a few days later.

---

## 4. Parity checklist (what Sequelize did implicitly that the new code must do explicitly)

- [ ] `createdAt`/`updatedAt` on insert; `updatedAt` on update
- [ ] Booleans out as `true/false`, in as 0/1
- [ ] `exerciseNotes` parsed object out, JSON text in; `null` when empty (route already collapses `{}` → null)
- [ ] `heartRateSeries` stays a string in both directions
- [ ] Dates: storage format on write; ISO on output; caller bounds converted before compare
- [ ] Nested arrays present even when empty (`workouts: []`, `exercises: []`, `sets: []`)
- [ ] Ordering: programs `isActive DESC, name ASC`; workouts/exercises `orderIndex ASC`; sets `id ASC`; history `completedAt DESC`
- [ ] Ad-hoc negative `exerciseId` → null (route logic, unchanged)
- [ ] Cascades now come from SQLite (`foreign_keys = ON`); Step 0 tests prove they still happen
- [ ] `set-active` and `complete` remain transactional
- [ ] `/history` `limit` clamp contract (4 existing tests) untouched

## 5. Risks

- **FK enforcement is new at the DB level.** A `POST /sets` with a positive `exerciseId` that doesn't exist now fails (500) instead of storing a dangling id. The frontend never sends one; both live DBs have zero violations. Acceptable, and map the SQLite FK error to 400 if a test surfaces it.
- **Drizzle-kit's generated baseline vs. hand edits.** Only the SQL text is edited; if `drizzle-kit generate` is ever re-run from scratch it would regenerate 0000 without `IF NOT EXISTS`. Guard: migration test (b) above fails loudly if the baseline stops being a no-op on the live DDL.
- **Backups during rollout.** `snapshot.js` runs inside whichever image is live; the dual-driver version must be in place *before* `ship.sh staging`, because `ship.sh` backs up staging first (old image) and the next backup hits the new image.
- **Two Nodes on the host.** Interactive shells get nvm's default (now 22.23.2, installed 2026-09-14); cron and non-interactive shells get the apt `/usr/bin/node` 18.19.1. That is fine for `backup.sh`'s one-line JSON parse, but `ship.sh` must never run the test gate under the system Node once better-sqlite3 is installed (native addon built for 22). Guard in Step 1.
- **Payload/perf regressions in RQB.** `history?limit=1000` (Progress page, ~636 KB) goes through relational queries' JSON aggregation; measure response time on staging against the old image (expect equal or better; Sequelize's include did a subquery + N joins).

## 6. Out of scope (later bundles)
No new tables, no `catalogId`, no server-side derived reads beyond the two scan fixes, no WAL, no Node bump inside Docker/CI, no `types/index.ts` cleanup (Bundle 6), no CLAUDE.md rules rewrite (Bundle 6).

---

## 7. Results (2026-09-14)

Shipped as `7bc0b81` + `24aad02` + `3b9020a` (staging 12:46 UTC, main 12:48 UTC; wife to follow days later).

- **Tests:** 71 backend (was 41): 22 new HTTP-only characterization tests in `parity.test.ts` were green on
  Sequelize first and passed on Drizzle with one adjustment (suggestion order pinned after the staging diff
  exposed it, see below); migration tests replay the literal live DDL; `columns.test.ts` covers the date format.
  Existing test files changed only in seed helpers — `git diff` shows zero `request(app)` lines touched.
- **Staging parity diff** (`scripts/api-snapshot.sh`, 41 files, old image vs new on the same seeded copy of main):
  first pass differed in 3 files — `suggestions-*` (the old `GROUP BY` returned names alphabetically per source,
  `SELECT DISTINCT` did not; fixed with explicit `ORDER BY`) and `programs.json` (two archived programs both named
  "test" swapped — an unspecified tie, now broken by `id ASC`). Final pass: **40/41 byte-identical**, the 41st is
  that tie.
- **Write lifecycle on staging:** start → log → edit → note → second set → complete with HR series → history /
  hints / stats all correct; raw storage verified as `2026-09-14 12:46:54.539 +00:00`, `real` weights, JSON text.
- **Rollback rehearsal:** `rollback.sh staging 1aeebcc` with **no restore** — the Sequelize image booted on the
  Drizzle-touched DB (extra `__drizzle_migrations` table + index ignored), served the new session identically,
  started and deleted a session. Rolled forward again cleanly. Rollback for this bundle = old tag only.
- **Speed (staging, same data):** `history-by-name` 37 ms → 2.7 ms; `history?limit=1000` (636 KB) 90 ms → 28 ms.
- **Backups:** `snapshot.js` dual-driver path exercised both ways — `sqlite3` against the old main image
  (seed-staging), `better-sqlite3` against the new staging image. Drop the `sqlite3` branch once wife is on ≥ `3b9020a`.
- **Deliberate behaviour change:** `GET /sessions/history?from=garbage` is 400 (was 200 with `[]`).
