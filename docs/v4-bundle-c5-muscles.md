# v4 Bundle C5: Muscle analytics

Status: **SHIPPED 2026-11-12 to staging, main and wife at `acaef7d`** (seeds applied: main 64 tagged / 10
untagged, wife 36 / 0; results in §11). Decided 2026-11-12, built on top of `1c4b266`. Written at `277f3fa` from `docs/v4-plan.md`
§2 C5 (2026-10-17), re-checked against the code on 2026-11-12 (it held). Decisions are in §10;
the 2026-11-12 deltas are folded into the sections below: migration `0008` (0007 is session notes),
`ALLTIME_FORMAT_VERSION` 6 → 7, the guideline band (§5a), the seed rebuilt for both instances
(§6, Appendices A and B), and the wife's instance shipping with this bundle.

**Gate:** both vitest suites and `tsc` pass; the new backend and muscle-count tests pass; the
`api-snapshot` diff on staging before/after the deploy is **only** `"muscles": null` on every catalog
entry; the previous image (`1c4b266`) boots on the migrated DB and lists/merges the catalog; on
staging the seed applies through the PUT, Progress shows sets per muscle with bands, and the coach
dossier carries the muscle block.

---

## 1. What it does

1. **Muscle tags per lift**, optional: each catalog entry may carry `{ primary, secondary }` from a
   fixed list of 18 muscles. Adding an exercise stays name + sets/reps; nothing ever asks for tags.
2. **Edited in Settings → Exercise catalog**: a third per-row action **Muscles…** opens a Modal.
3. **A one-off seed** per instance, built from free-exercise-db for name matches and applied
   through the new PUT (staging, then main and wife, each after a backup). No row-by-row approval
   (D6): corrections happen in Settings afterwards. The server never guesses tags.
4. **Progress**: working sets per muscle per week (a secondary muscle counts ½), a guideline band on
   the 4-week average (low / building / solid / high), and a flag on muscles untrained for 14+ days.
   Untagged lifts still count everywhere else, just not per muscle.
5. **Coach**: the same numbers as a short block in the dossier's all-time section.

## 2. The column case

`ExerciseCatalog.muscles TEXT` (JSON `{primary: Muscle[], secondary: Muscle[]}`), **nullable, NULL =
untagged**. No new table: CHANGELOG row + migration `0008_catalog_muscles`
(`ALTER TABLE \`ExerciseCatalog\` ADD \`muscles\` text;`).

- **Why the catalog, not Exercises.** Muscles are a property of the *lift*, and the catalog is the
  lift's identity. On `Exercises` they would be per program slot: every program copy, import and
  duplicate would need them copied, sets logged ad hoc or after a swap (`exerciseId: null`) would
  have none, and history from a deleted program would lose them. Every Set already carries
  `catalogId`, so a set's muscles are one map lookup.
- **Why not on the catalog only as names.** Renames: merges move identity to one entry, so tags
  follow the merge (§4). A program-exercise **rename to a new name** resolves to a new, untagged entry
  (`resolveCatalogId` insert; "this slot now does a different lift"). Only merges inherit.
- **Nullable**: an older image names its columns explicitly in every select (`listEntries`,
  `findEntry` uses `select()` from its own schema) and its inserts (`resolveCatalogId`, split) omit
  the column, so they still work.

## 3. Vocabulary (decision D2)

A Zod enum on the backend (`MUSCLES` in `db/schema.ts`, used by `routes/catalog.ts`) and the same list with labels and display order on
the frontend (`shared/lib/muscles.ts`; a comment in each points at the other). Ids are stored, labels
are display-only, so a label can change freely; **an id can only be added, never renamed or removed**
(an older backend would 400 a PUT carrying it; stored data would orphan).

| Group | Ids (label) |
|---|---|
| Push | `chest` (Chest), `front-delts` (Front delts), `side-delts` (Side delts), `triceps` (Triceps) |
| Pull | `lats` (Lats), `upper-back` (Upper back: traps, rhomboids, mid back), `rear-delts` (Rear delts), `biceps` (Biceps), `forearms` (Forearms) |
| Core | `abs` (Abs), `obliques` (Obliques), `lower-back` (Lower back) |
| Legs | `quads` (Quads), `hamstrings` (Hamstrings), `glutes` (Glutes), `adductors` (Adductors), `abductors` (Abductors), `calves` (Calves) |

free-exercise-db has 17 (`shoulders`, `middle back`, `traps`, `neck`, …). Mapping: `shoulders` is
split by the lift (presses → front delts, raises → side delts, reverse flies and rows → rear delts);
`middle back` + `traps` → upper back; `abdominals` → abs; `quadriceps` → quads; `lower back` →
lower-back; `neck` dropped. The program trains side and rear delts separately (Lateral Raise, Rear
Delt Fly), so one "shoulders" bucket would hide the split that matters most here.

## 4. Backend

- `schema.ts`: `muscles: text('muscles', { mode: 'json' }).$type<MuscleTags | null>()`; `drizzle-kit
  generate --name=catalog_muscles`, SQL reviewed.
- **`PUT /api/catalog/:id`** `{ muscles: { primary, secondary } | null }`, `validateParams(idParamSchema)`.
  - Each list: enum ids, no duplicates, ≤ 18. A muscle in both lists → 400. `secondary` non-empty
    with `primary` empty → 400. `{primary: [], secondary: []}` is stored as NULL (untagged), so
    "untagged" has one representation.
  - 404 for a missing id. Response = the `listEntries(id)[0]` row (same shape as `GET`).
  - **Bumps the row's `updatedAt`**: `catalogFingerprint()` (`shared/lib/catalog.ts`) is
    `count:max(updatedAt)` and is part of the coach memo key, so a tag change refreshes the dossier.
    Touches no Sets/Exercises row.
- `listEntries` (`routes/catalog.ts:31`) adds `muscles` to its explicit select → `GET /api/catalog`,
  the merge response and the split response carry it.
- **Merge** (`:68`, deletes B): **keep A's tags; if A is untagged, take B's.** Same transaction.
- **Split** (`:109`, rebuilds from names): the split-off entry gets **a copy of A's tags** (same lift
  until the user says otherwise).
- **GC** in `backfillCatalog()` (`db/catalog.ts`, step 3) adds `AND muscles IS NULL`: a tagged entry
  with no rows left (its only program was deleted) keeps its tags for the day the name comes back.
- No auto-tagging anywhere: `resolveCatalogId` inserts NULL, the backfill inserts NULL.
- Exports, import, duplicate, coach `propose_program*`: untouched (muscles live on the catalog, and a
  name resolves to its entry on write, so an imported "Leg Press" is already tagged).
- `api-snapshot.sh` gains `snap catalog "catalog"` so the before/after diff covers the changed
  endpoint (the before snapshot is taken with the new script on the old image).

## 5. Frontend

- Types: `CatalogEntry.muscles?: MuscleTags | null` (optional: an older backend omits it → untagged).
- `shared/lib/muscles.ts`: ids, labels, groups, `catalogMuscles(entries)` → `Map<catalogId, MuscleTags>`.
- `shared/lib/muscleSets.ts` (pure, + tests), shared by Progress and the coach:
  - Counts **working sets** (`dropIndex` 0) of **strength** exercises with reps > 0, any weight
    (bodyweight and assisted sets count — this is sets, not load).
  - A set's muscles come from `set.catalogId`; no id or untagged entry → counted in `untaggedSets`.
  - Primary = 1 set to each listed muscle; secondary = ½ (D1). A lift with two primaries gives 1 to
    each (it trains both).
  - Weeks are Sunday weeks on the session's **local** day (`localDateKey`; `startOfWeek` moves from
    `progress/logic/volumePeriods.ts` to `shared/lib/localDate.ts`, re-exported where used).
  - Output per muscle: sets this week to date, average of the last 4 whole weeks, last trained
    local date, days since. Plus `untaggedSets` over the same 4 weeks.
  - **Untrained flag**: trained at least once ever, last trained 14+ days ago. Never-trained muscles
    are listed once, separately, not flagged (D5).
- **Progress** (D3): a **Muscles** tab after Volume. One row per muscle in vocabulary order, grouped
  Push / Pull / Core / Legs: label, this week, 4-week average, a thin bar of the average, "last 21 d
  ago" in `accent-*` when flagged. Footer: "N of M sets in the last 4 weeks are on untagged lifts —
  tag them in Settings". With no tags at all: an empty state pointing at Settings → Exercise catalog.
- **Settings → Exercise catalog**: rows show their tags under the name (`quads · glutes, hamstrings`,
  secondary muted); a **Muscles…** button beside **Merge into…**; the collapsed summary adds
  "N untagged". The Modal (D9): Primary and Secondary chip groups over the 18 muscles (picking a muscle
  in one list removes it from the other), Clear, Save. Mutation `useSetCatalogMuscles` invalidates
  `catalog` only (no history row changes).
- **Coach dossier**: a block after the all-time rollup, built by `buildMuscleBlock()` in `dossier.ts`
  from `muscleSets`:

  ```
  Weekly working sets per muscle (secondary counts ½; avg of last 4 whole weeks + band / this week so far; bands: low <6, building 6–10, solid 10–20, high >20):
    chest 9.5 building / 3, front-delts 6 building / 1.5, …
    untrained 14+ days: calves (21 d)
    never trained: obliques
    untagged lifts: 4 of 212 sets in the last 4 weeks
  ```

  "Muscle tags: none yet." when no entry is tagged. One persona line says the bands are a rule of
  thumb (small muscles can sit at "low" and be fine) and that untagged lifts are missing.
  It lives in `buildAllTimeParts` (it needs every session for "last trained"), so it is memoized with
  the all-time block. `ALLTIME_FORMAT_VERSION` 6 → 7. The memo key already changes on a tag edit
  (catalog fingerprint) and on a new day. Per-lift tags are **not** added to each rollup line (~500
  tokens for what the model already knows about "Leg Press").

## 5a. Guideline band (D10)

One fixed rule for every muscle, on the 4-week average, in `shared/lib/muscleSets.ts` (`BANDS`,
`muscleBand()`): `low` < 6, `building` 6 to < 10, `solid` 10–20 (both ends), `high` > 20.

- Muscles tab: a small label per row; `solid` in `primary-*` (label and bar), the rest muted grey, with
  the 10–20 stretch faintly tinted on each bar. Amber (`accent-*`) stays reserved for the 14-day
  untrained flag, so small muscles that sit at "low" forever (forearms, obliques) don't nag. Never red.
  Never-trained muscles get no row and no label; they are listed once below.
- Coach block: the label after each average (above).

## 6. The seed

- **Source**: `yuhonas/free-exercise-db` at `f00c92c` (`dist/exercises.json`, 876 exercises). License
  checked 2026-10-17: **The Unlicense** (repo license API + `LICENSE.md`: "released into the public
  domain"); its upstream `wrkout/exercises.json` is also Unlicense. Only muscle lists are used; no
  instructions, images or names are copied into the app.
- **Rebuilt 2026-11-12** (the 2026-10-17 list was never written down) by a throwaway script: fetch
  `dist/exercises.json` at `f00c92c` into its own directory, match each catalog name (exact, then
  normalised, then a hand map to a source entry), map the 17 source muscles to our 18 (§3), apply the
  doc's corrections, write one JSON per instance plus the tables below.
- **Corrections** (listed per row in the tables): no `calves` on squats, lunges or hinges (and no
  "shoulders" on Goblet Squat); `side-delts` added to overhead presses; `upper-back` added to rear-delt
  work; Deadlift and the carries trimmed to what they train most; Pallof Press is `abs, obliques`
  (the source's chest/triceps secondaries are the arm push, not the training effect). Entries with
  no source match carry a hand suggestion (main: Bird dog, Mst row; wife: Ab, Rotary torso).
- **Main** (74 entries): 64 tagged, 10 untagged (test rows, three junk names with 0 sets, the two
  cardio entries, Hamstring stretch). Appendix A.
- **Wife** (36 entries): all 36 tagged; she has no test/junk/cardio entries. Appendix B.
- Applied through `PUT /api/catalog/:id` by a one-off script, ids looked up by **name** at apply time
  (staging, a copy of main, resolves the same rows as main). The request carries only muscle ids.
  Order: staging → spot-check → `scripts/backup.sh main` → main → `scripts/backup.sh wife` → wife.
- **Wife ships with this bundle** (D11), same commit, her own seed.

## 7. Compatibility and rollback

- **Older image (`1c4b266`) on the migrated DB**: its migrator stops at `0007`; its selects don't name
  `muscles`; its inserts omit it → NULL. `GET /catalog` simply lacks the field.
- **Rollback caveats** (accepted, as the plan says):
  - The old GC deletes **tagged orphans** (entries no Set/Exercise points at), losing their tags. An
    orphan has no history to analyse; its tags are re-entered if the name returns.
  - An old-image **merge** deletes B without inheriting, so B's tags are lost if A was untagged; an
    old-image **split** creates an untagged entry. Tags otherwise survive untouched and are back on
    roll-forward.
- **Older UI + newer backend**: never sends `muscles`; responses gain one field.
- **Newer UI + older backend** (only during a rollback; B3 serves the UI from the same server):
  `muscles` absent → everything untagged, the Muscles tab shows its empty state; a PUT 404s → the
  mutation's error toast. No crash.
- API only gains a field and an endpoint. No change to any request schema the old clients send.

## 8. Tests

Backend (`catalog-routes.test.ts`, `catalog.test.ts`, `migrations.test.ts`, `parity.test.ts`):
- Migration: 9 migrations recorded; existing rows NULL; an insert omitting the column succeeds.
- `GET /catalog` carries `muscles: null`; a new name resolves to an untagged entry.
- PUT: set, replace, `null` clears, empty lists → NULL; unknown id, duplicate, overlap, secondary
  without primary, wrong shape → 400; missing entry → 404; bumps that row's `updatedAt` only; no
  Sets/Exercises `updatedAt` changes.
- Merge: A tagged keeps A's; A untagged takes B's; both untagged → NULL. Split copies A's tags.
- GC: an unreferenced tagged entry survives boot; an unreferenced untagged one is still removed.

Frontend (`muscleSets.test.ts`, `dossier.test.ts`, `muscles.test.ts`):
- Primary 1 / secondary ½; two primaries; drop sets, cardio, reps 0 excluded; assisted and 0-weight
  sets counted; untagged and missing-catalogId sets go to `untaggedSets`.
- Sunday weeks; a session at 9 pm Eastern on Saturday lands in that week (local day, also run under
  `TZ=America/New_York`); 4-week average over whole weeks only; this-week-to-date.
- Untrained flag at 13 vs 14 days; never-trained listed, not flagged.
- Band thresholds 5.5 / 6 / 9.5 / 10 / 20 / 20.5.
- Dossier muscle block text with bands (exact), "Muscle tags: none yet." when nothing is tagged, and
  the all-time parts include it.
- `catalogMuscles()` ignores `muscles` absent (older backend).

## 9. Rollback check and staging plan

1. `scripts/api-snapshot.sh staging <before>` (with the catalog line added) on the old image.
2. `scripts/ship.sh staging` → `api-snapshot` after → `diff -r`: only `"muscles": null` lines in
   `catalog.json`.
3. Rollback on a **copy** of the migrated staging DB (`scripts/backup.sh staging` → a throwaway
   container of the `1c4b266` backend image on that file): boots, 9 migrations recorded, none
   re-run; `GET /catalog` works without the field; a merge works. Tag an orphan first to see the GC
   caveat happen as documented.
4. Apply the seed to staging through the PUT; check `GET /catalog`.
5. Headless (Pixel 7, 8037): Settings → catalog row tags + Muscles… edit/save/clear; Progress →
   Muscles tab numbers vs a hand count for one muscle; coach dossier contains the block (staging has
   no key: inspect the assembled prompt via an intercepted provider call, as in C4).
6. `ship.sh main` → `backup.sh main` → seed main → `ship.sh wife` → `backup.sh wife` → seed wife;
   report tagged/untagged counts per instance. No APK (no native change).

## 10. Decisions (Jason, 2026-11-12)

| # | Question | Decision |
|---|---|---|
| D1 | Does a secondary muscle count ½ a set? | Yes |
| D2 | Vocabulary | The 18 in §3 (delts split three ways, traps + mid back = upper back, obliques separate) |
| D3 | Where in Progress | A new **Muscles** tab after Volume |
| D4 | Window shown | This week to date + average of the last 4 whole weeks, per muscle |
| D5 | Untrained flag | 14+ days, only for muscles trained at least once; never-trained listed separately |
| D6 | Seed | **Just apply it** (staging → main), no row-by-row approval; corrections in Settings afterwards |
| D7 | Coach | One muscle block; no per-lift tags on the rollup lines |
| D8 | Which sets count | Working strength sets with reps > 0, any weight |
| D9 | Modal | Primary / Secondary chip groups, picking in one removes from the other |
| D10 | Guideline band (new) | On the 4-week average, one fixed rule for every muscle (§5a) |
| D11 | Wife's instance (new) | Ships with this bundle, with her own seed built the same way |

## 11. Results (2026-11-12)

- Tests: backend 140, frontend 359 (also under `TZ=America/New_York`); `tsc` clean.
- Snapshot diff on staging (`1c4b266` → `acaef7d`, fresh copy of main): exactly 74 added
  `"muscles": null` lines in `catalog.json`, nothing else.
- Rollback check (copy of migrated staging, `1c4b266` backend): boots, 9 migrations recorded, none
  re-run; `GET /catalog` lists 74 without the field; a merge (Leg Curl ← Leg Curl Machine) 200s; tags
  on other rows survive. A planted tagged orphan was GC'd by the old image, as §7 says.
- Staging, headless (Pixel 7): Muscles tab matched an independent SQL count from a backup (side delts
  1 avg / 4.5 this week, quads 3.75 / 4.5, calves flagged at 38 d, 0 of 62 sets untagged); Muscles…
  save (primary pick moved Triceps out of secondary), clear and restore all landed on the server;
  summary shows "10 without muscles"; the intercepted coach request carried the muscle block and the
  persona line.
- Seeds: main 64/64 PUTs (catalog 64 tagged / 10 untagged), wife 36/36 (36 / 0). Backups taken just
  before each: `main-20261112-031256.sqlite`, `wife-20261112-031331.sqlite`.
- Main's 4-week averages are all in the `low` band today (7 sessions in the last 30 days).

## Appendix A: main's seed (applied 2026-11-12)

Built from main's catalog as of 2026-11-12. Primary / secondary in our ids; "Change from source" is
relative to the plain §3 mapping of the source entry.

| Catalog entry | Sets | Source (free-exercise-db) | Primary / secondary | Change from source |
|---|---|---|---|---|
| Abbs | 0 | — | untagged | junk name, 0 sets |
| Abdominal crunch | 3 | Crunches | abs |  |
| Ass | 0 | — | untagged | junk name, 0 sets |
| Assisted pullups | 3 | Pullups | lats / upper-back, biceps |  |
| Back Extension | 6 | Hyperextensions Back Extensions | lower-back / hamstrings, glutes |  |
| Back extension machine | 3 | Hyperextensions Back Extensions | lower-back / hamstrings, glutes |  |
| Barbell Bench Press | 0 | Barbell Bench Press - Medium Grip | chest / front-delts, triceps |  |
| Barbell bicep curl | 3 | Barbell Curl | biceps / forearms |  |
| Barbell RDL | 9 | Romanian Deadlift | hamstrings / lower-back, glutes | dropped calves |
| Barbell Row | 0 | Bent Over Barbell Row | upper-back / lats, rear-delts, biceps |  |
| Bench Press | 0 | Barbell Bench Press - Medium Grip | chest / front-delts, triceps |  |
| Bicep Curl | 42 | Dumbbell Bicep Curl | biceps / forearms |  |
| Bicep Curl Machine | 10 | Machine Bicep Curl | biceps |  |
| Bicep Curls | 0 | Dumbbell Bicep Curl | biceps / forearms |  |
| Bird dog | 6 | — | lower-back / abs, glutes | no source match; hand suggestion |
| Butt | 0 | — | untagged | junk name, 0 sets |
| Cable Crunch | 9 | Cable Crunch | abs |  |
| Cable Row | 76 | Seated Cable Rows | upper-back / lats, rear-delts, biceps |  |
| Calf Raise Machine | 3 | Standing Calf Raises | calves |  |
| Chest Press Machine | 71 | Leverage Chest Press | chest / front-delts, triceps |  |
| Chest-Supported Row | 34 | Dumbbell Incline Row | upper-back / lats, rear-delts, biceps, forearms |  |
| Dead Bug | 0 | Dead Bug | abs |  |
| Deadlift | 15 | Barbell Deadlift | lower-back, hamstrings, glutes / upper-back, forearms, quads | primary was lower-back; dropped lats, calves |
| Dumbbell Bicep Curl | 3 | Dumbbell Bicep Curl | biceps / forearms |  |
| Dumbbell Bulgarian Split Squat | 63 | Split Squat with Dumbbells | quads / hamstrings, glutes |  |
| Dumbbell chest Press | 0 | Dumbbell Bench Press | chest / front-delts, triceps |  |
| Dumbbell Flys | 20 | Dumbbell Flyes | chest |  |
| Dumbbell RDL | 97 | Romanian Deadlift | hamstrings / lower-back, glutes | dropped calves |
| Dumbbell Shoulder Press | 3 | Dumbbell Shoulder Press | front-delts / side-delts, triceps | added side-delts |
| Farmer Carry | 4 | Farmers Walk | forearms / upper-back, abs | dropped lower-back, quads, hamstrings, glutes |
| Glute bridge | 35 | Butt Lift Bridge | glutes / hamstrings |  |
| Glute kick | 6 | Glute Kickback | glutes / hamstrings |  |
| Goblet Squat | 72 | Goblet Squat | quads / hamstrings, glutes | dropped front-delts, calves |
| Hamstring stretch | 6 | — | untagged | stretch |
| Hip abduction | 6 | Thigh Abductor | abductors / glutes |  |
| Hip Abduction Machine | 146 | Thigh Abductor | abductors / glutes |  |
| Hip adductor | 3 | Thigh Adductor | adductors / hamstrings, glutes |  |
| Hip thrust | 6 | Barbell Hip Thrust | glutes / hamstrings | dropped calves |
| Incline chest press | 21 | Leverage Incline Chest Press | chest / front-delts, triceps |  |
| Incline Lateral Raise | 31 | One-Arm Incline Lateral Raise | side-delts |  |
| Incline Rear Delt Raise | 11 | Lying Rear Delt Raise | rear-delts / upper-back | added upper-back |
| Lat Pulldown Machine | 95 | Wide-Grip Lat Pulldown | lats / upper-back, rear-delts, biceps |  |
| Lateral Raise | 31 | Side Lateral Raise | side-delts |  |
| Leg Curl | 66 | Lying Leg Curls | hamstrings |  |
| Leg Curl Machine | 68 | Lying Leg Curls | hamstrings |  |
| Leg Press | 135 | Leg Press | quads / hamstrings, glutes | dropped calves |
| Low Incline Dumbbell Press | 146 | Incline Dumbbell Press | chest / front-delts, triceps |  |
| Mst row | 3 | — | upper-back / lats, rear-delts, biceps | no source match; hand suggestion |
| Mts abdominal crunch | 3 | Ab Crunch Machine | abs |  |
| Neutral Grip Pull-Up | 101 | Pullups | lats / upper-back, biceps |  |
| Overhead Press | 0 | Standing Military Press | front-delts / side-delts, triceps | added side-delts |
| Pallof Press | 26 | Pallof Press | abs, obliques | primary was abs; dropped chest, front-delts, triceps |
| Pec fly | 44 | Butterfly | chest |  |
| Preacher curl machine | 3 | Machine Preacher Curls | biceps |  |
| Pull-Up | 18 | Pullups | lats / upper-back, biceps |  |
| Pull-ups | 0 | Pullups | lats / upper-back, biceps |  |
| Rear Delt Fly | 30 | Reverse Flyes | rear-delts / upper-back | added upper-back |
| Rear Delt Machine | 12 | Reverse Machine Flyes | rear-delts / upper-back | added upper-back |
| Ride | 2 | — | untagged | cardio |
| Romanian Deadlift | 0 | Romanian Deadlift | hamstrings / lower-back, glutes | dropped calves |
| Seated DB Overhead Press | 54 | Dumbbell Shoulder Press | front-delts / side-delts, triceps | added side-delts |
| Seated Row Machine | 84 | Seated Cable Rows | upper-back / lats, rear-delts, biceps |  |
| Shoulder Press Machine | 94 | Machine Shoulder Military Press | front-delts / side-delts, triceps | added side-delts |
| Smith bench press | 3 | Smith Machine Bench Press | chest / front-delts, triceps |  |
| Squat | 24 | Barbell Squat | quads / lower-back, hamstrings, glutes | dropped calves |
| Standing calf raise | 6 | Standing Calf Raises | calves |  |
| test1 | 0 | — | untagged | test row |
| test2 | 0 | — | untagged | test row |
| test3 | 0 | — | untagged | test row |
| test4 | 0 | — | untagged | test row |
| Treadmill | 1 | — | untagged | cardio |
| Tricep Extension Machine | 19 | Cable Rope Overhead Triceps Extension | triceps |  |
| Tricep Pushdown | 26 | Triceps Pushdown | triceps |  |
| Wide bar cable row | 3 | Seated Cable Rows | upper-back / lats, rear-delts, biceps |  |

## Appendix B: wife's seed (applied 2026-11-12)

| Catalog entry | Sets | Source (free-exercise-db) | Primary / secondary | Change from source |
|---|---|---|---|---|
| Ab | 10 | — | abs | no source match; hand suggestion |
| Abdominal crunch | 3 | Crunches | abs |  |
| Assisted Pull-Up | 72 | Pullups | lats / upper-back, biceps |  |
| Barbell RDL | 6 | Romanian Deadlift | hamstrings / lower-back, glutes | dropped calves |
| Cable Bicep Curl | 66 | Standing Biceps Cable Curl | biceps |  |
| Cable Row | 72 | Seated Cable Rows | upper-back / lats, rear-delts, biceps |  |
| Cable Tricep Pushdown | 9 | Triceps Pushdown | triceps |  |
| Chest Fly | 63 | Butterfly | chest |  |
| Chest Press | 0 | Leverage Chest Press | chest / front-delts, triceps |  |
| DB Lateral Raise | 33 | Side Lateral Raise | side-delts |  |
| Dumbbell RDL | 56 | Romanian Deadlift | hamstrings / lower-back, glutes | dropped calves |
| Farmer Walk | 5 | Farmers Walk | forearms / upper-back, abs | dropped lower-back, quads, hamstrings, glutes |
| Flat Dumbbell Press | 15 | Dumbbell Bench Press | chest / front-delts, triceps |  |
| Glute Bridges | 57 | Butt Lift Bridge | glutes / hamstrings |  |
| Glute kickback | 3 | Glute Kickback | glutes / hamstrings |  |
| Goblet Squat | 84 | Goblet Squat | quads / hamstrings, glutes | dropped front-delts, calves |
| Hip Abduction Machine | 96 | Thigh Abductor | abductors / glutes |  |
| Hip adductor | 12 | Thigh Adductor | adductors / hamstrings, glutes |  |
| Hip Adductor Machine | 54 | Thigh Adductor | adductors / hamstrings, glutes |  |
| Incline Dumbbell Press | 30 | Incline Dumbbell Press | chest / front-delts, triceps |  |
| Incline Lateral Raise | 18 | One-Arm Incline Lateral Raise | side-delts |  |
| Lat Pulldown | 81 | Wide-Grip Lat Pulldown | lats / upper-back, rear-delts, biceps |  |
| Leg Press | 90 | Leg Press | quads / hamstrings, glutes | dropped calves |
| Machine Chest Press | 108 | Leverage Chest Press | chest / front-delts, triceps |  |
| Machine Chest Press (Flat) | 3 | Leverage Chest Press | chest / front-delts, triceps |  |
| Machine Crunch | 21 | Ab Crunch Machine | abs |  |
| Machine Shoulder Press | 111 | Machine Shoulder Military Press | front-delts / side-delts, triceps | added side-delts |
| Rear Delt Machine | 69 | Reverse Machine Flyes | rear-delts / upper-back | added upper-back |
| Romanian deadlift | 18 | Romanian Deadlift | hamstrings / lower-back, glutes | dropped calves |
| Rotary torso | 3 | — | obliques / abs | no source match; hand suggestion |
| Seated Machine Leg Curl | 23 | Seated Leg Curl | hamstrings |  |
| Squat | 0 | Barbell Squat | quads / lower-back, hamstrings, glutes | dropped calves |
| Triceps extension | 3 | Cable Rope Overhead Triceps Extension | triceps |  |
| Triceps press | 12 | Dip Machine | triceps / chest, front-delts |  |
| Triceps Pushdown | 42 | Triceps Pushdown | triceps |  |
| Weight carry walk | 3 | Farmers Walk | forearms / upper-back, abs | dropped lower-back, quads, hamstrings, glutes |

