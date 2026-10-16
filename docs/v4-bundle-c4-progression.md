# v4 Bundle C4: Progression (better rule, per-exercise step, deload) + coach program edits

Status: **building (decisions §6, Jason 2026-10-16).** Written 2026-10-16 at `046d986`, from
`docs/v4-plan.md` §2 C4 re-checked against the code and **replayed against main's history** that day.
The plan's "linear scheme" was dropped after that replay (§2); line numbers are from that read.

**Gate:** both vitest suites and `tsc` pass; the new backend and progression tests pass; the
`api-snapshot` diff on staging before/after is **only** the new `incrementLbs: null` on every exercise
object; the previous image (`ddd221b`) boots on the migrated DB, lists and creates exercises; on
staging the hint says "go up" for a 12/10/8 session on an 8-12 lift, the per-exercise step shows up
in the hint, and a coach edit previews and applies.

---

## 1. What it does

1. **A better add-weight rule** (double progression, kept): go up when **set 1 hits the top of the
   range and every set stays in the range**, judged on the sets at the session's **heaviest
   weight** (ramp-up sets are ignored). Was: every working set at the top, all at one weight.
2. **Per-exercise weight step** (optional): `Exercises.incrementLbs`, empty = the global Settings
   value. Set in a collapsed **Advanced** section of the exercise form.
3. **Deload hint**: stalled 3+ sessions **and** the latest session's best set fell below the bottom
   of the range → −10%, rounded to 5 lb. No hint when rounding gives the same weight.
4. **Coach propose-edit**: a third coach tool proposes changes to the **active program**; a preview
   lists each change; **Apply** runs the existing program-builder writes. The coach still writes
   nothing itself (same model as Import).

The Settings **Enable auto-progression** checkbox still gates 1–3 per instance; the global
increment stays the default step. Hints are still a pre-fill before the first set; nothing rewrites
the program except a user-tapped Apply.

## 2. Why: main's history (103 sessions, 2025-12-31 → 2026-10-16)

- Effort is RPE 9–10 on almost every set, so set 3 fades 2–4 reps: Seated DB Overhead Press sat at
  35 lb for five months (12/8/8, 12/10/8 …) and the old rule never fired; Low Incline DB Press 45 lb
  ran 12/10/8 for eight sessions.
- Replaying the rules over every consecutive pair of sessions (414): the old rule fired **54** times,
  Jason actually went up **95** times, the new rule fires **114**. The old rule was mostly being
  overridden upward.
- Ramp sets (Squat 95/115/135, Hip Abduction 60×20) broke "all at one weight", so no hint at all.
- Steps: Squat/Deadlift move 10 at a time, Leg Curl uses 2.5 (77.5), Lateral Raise 10 → 15 (+50%)
  failed for four sessions and went back. One global +5 fits none of them.
- Deload on the plain stall flag would fire on 5 of 20 lifts next session, mostly wrongly (Low
  Incline DB at 12 reps on a 6–10 range; Cable Row holding 10–12; Lateral Raise 10 → 5). With the
  below-range condition it fires on none today: a safety net for a grinding barbell lift.
- **Linear scheme dropped** (Jason): adding weight at the bottom of a range (6/6/6 on 6–8) suits
  novice barbell work, not this training; the 5×5 / Greyskull presets are cut for the same reason
  (Jason ran 5×5 and prefers the current program).

## 3. The column case

`Exercises.incrementLbs REAL` **nullable, NULL = use the global setting**. Per program slot, like
`targetSets`/`targetReps`: the step depends on the equipment in that slot (barbell 10, a pin-stack
2.5, dumbbells 5), and the same lift in another program can differ. Not on the catalog (equipment,
not identity) and not in Settings (would need a name-keyed map that a rename breaks). Nullable, so
an older image's inserts (which don't name the column) still succeed. CHANGELOG row + migration
`0006_exercise_increment`; no new table.

## 4. Re-check against the code (`046d986`)

| # | Where | Note |
|---|---|---|
| 1 | `computeProgression` | Only caller `ExerciseCard.tsx:104-112`; chip `:544-553`; weight chain `:117-122`; reps via `suggestReps` `:126-136`. Old rule used `working[0].weight` as the weight (a ramp set) |
| 2 | Stall history | `all-sets-by-name` = standard sets of **completed** sessions, catalog-grouped, with `completedAt`; `usePrCelebration.ts:51` uses `queryKeys.exerciseAllSets(name)`. `stallRun`/`addToDayTop` in `liftTrend.ts` work on raw signed weight; top weight 0 never stalls |
| 3 | Copy paths for the column | Export `programs.ts:180-191`; `importExerciseSchema` `:29-39`; `insertProgramTree` `:81-120` (import **and** program duplicate); workout duplicate `workouts.ts:157-171`; exercise create/update schemas + insert/update `exercises.ts`; coach `normalizeExercise` `tools.ts:200-222`; `ProgramExportExercise` type. `/start`, `/sessions/:id`, `GET /programs` select all columns → carry it with no change |
| 4 | ExerciseForm | Update already sends the whole exercise (strength and cardio), so a PUT never consists of the new field alone (older backend's `refine(keys > 0)`). Keep it so; comment why |
| 5 | Virtual exercises | `makeVirtualExercise` default `incrementLbs: null`; the swap (`index.tsx:339`) does not copy it (substitute lift, different equipment) |
| 6 | Coach | `propose_program` only creates; `onProposeProgram` → Import modal (`coach/index.tsx:268-316`). Program block `dossier.ts:353-380` lists `name 3×8-12 (superset A)` but no ids. It is not the all-time block → no `ALLTIME_FORMAT_VERSION` bump |
| 7 | Program writes for Apply | `POST /workouts` `{programId,name,orderIndex}`, `POST /exercises`, `PUT /exercises/:id`, `DELETE /exercises/:id`, `POST /workouts/:id/reorder-exercises` `{exerciseIds}` — all exist, no new endpoint |

## 5. Design

### 5.1 Backend
- `schema.ts`: `incrementLbs: real('incrementLbs')`. `drizzle-kit generate --name=exercise_increment`
  → `ALTER TABLE \`Exercises\` ADD \`incrementLbs\` real;` (reviewed).
- Zod `incrementSchema = z.number().positive().max(100).nullable()`: create `.optional()` (insert
  `?? null`), update `.optional()`, import `.optional().default(null)`. `insertProgramTree`, workout
  duplicate, export copy it. Export stays `version: 1` (optional field).

### 5.2 Progression logic (`active-session/logic/progression.ts`, pure, + tests)
```ts
computeProgression({ previousSets, targetReps, incrementLbs, history? }): ProgressionResult | null
// ProgressionResult gains kind: 'up' | 'hold' | 'deload'  (ready === kind === 'up', kept)
```
- `top` = heaviest weight among last session's working sets (raw signed: −30 > −40);
  `topSets` = sets at `top`, in setNumber order.
- **up**: `topSets[0].reps ≥ high` and every `topSets` rep `≥ low` → `top + incrementLbs`.
  `Last: 45×12 → Try: 50 ↑`.
- **deload**: else, `history` given, `stallRun(history).sessions ≥ 3`, `stallRun.weight === top`,
  best `topSets` rep `< low`, and `deloadWeight(top) < top` → `Stuck at 225 for 3 sessions → Try: 200 ↓`.
- **hold**: else `top`, reps from `suggestReps` (unchanged), `Aim for 45×10 on set 1, all sets 6+ to go up`.
- `deloadWeight(w)` = `w − 0.1·|w|` rounded to the nearest 5, ties down (225 → 200, 145 → 130,
  −30 → −35); a light lift (10 → 9 → 10) returns `w` = no deload.
- `history`: `Map<localDate, DayTop>` from `all-sets-by-name` (raw weight, working sets).

### 5.3 Frontend wiring
- `ExerciseCard`: step = `exercise.incrementLbs ?? settings.incrementLbs`. The all-sets query
  (`useExerciseAllSets(name, enabled)` in `queries.ts`, same key/fn as the PR check) is **enabled only
  when progression is on and last session's best top-set rep is below `low`** — the only case the
  deload can fire — so normal sessions make no extra request. Deload chip `accent-*` with ↓; up stays
  green 📈; hold grey. Never red.
- `ExerciseForm`: collapsed **Advanced** (strength only; opens when a step is set): "Weight step (lb)",
  placeholder `Default (5)` from Settings, blank = null. POST and PUT send it; PUT stays a full
  exercise (§4 #4).
- `WorkoutCard` row and the import previews: ` · +10 lb` when a step is set.
- Settings → Auto-Progression copy: the rule in one line, "per-exercise step: Programs → exercise →
  Advanced", the checkbox unchanged.

### 5.4 Coach propose-edit
- Tool **`propose_program_edit`** `{ workouts: [{ name, exercises: [{ name, targetSets, targetReps,
  supersetGroup?, incrementLbs? }] }] }`: for each workout listed, its **complete** new exercise list.
  Workouts not listed are untouched (never deleted). A listed name that matches no active-program
  workout (case-insensitive) becomes a **new workout**.
- `lib/programEdit.ts` (pure, + tests) diffs it against the active program: exercises matched by
  name within the workout (case-insensitive, in order for duplicates) →
  `add` / `remove` / `update` (sets, reps, superset, step; omitted step = unchanged) / `reorder`.
  Cardio exercises keep their cardio fields (only remove / reorder apply). New exercises are strength.
  Rejected (tool error to the model): no active program, empty diff, a workout emptied entirely.
- Preview Modal on the coach page lists every change per workout (`+ Face Pull 3×12-15`,
  `− Pallof Press`, `Lateral Raise 3×10-15 → 3×8-12`, `Low Incline DB Press step +2.5 lb`,
  `Order changed`). **Apply** runs, in order per workout: create workout (new), deletes, full PUTs,
  creates, reorder; then invalidates programs. Not transactional: on a failure it stops, toasts
  "Applied N of M changes", and refetches (the preview never claims more than happened).
- Program block shows the step (` +10 lb steps`) so the model sees it. Persona: the new tool, "list
  each changed workout's full exercise list", the progression rule in one line. `propose_program`
  accepts `incrementLbs` too.
- CLAUDE.md: the coach is still read-only; the user's Import / Apply runs the existing endpoints.

## 6. Decisions (Jason, 2026-10-16)

| # | Decision |
|---|---|
| D1 | Deload −10%, rounded to 5 lb |
| D2 | Deload trigger: the 3-session stall flag **and** the latest best set below the range (tightened after the replay, §2) |
| D3 | Keep double progression; add weight when set 1 tops the range and every set is in range, on the heaviest-weight sets. **No linear scheme** |
| D4 | Per-exercise weight step in a collapsed Advanced section of the exercise form |
| D5 | The Settings "Enable auto-progression" checkbox stays the switch; no new toggle for the new rule |
| D6 | Coach: propose-edit + Apply button, in this bundle; `propose_program` may set the step |
| D7 | 5×5 / Greyskull presets: **cut** |
| D8 | The wife's instance gets all of it later on the same commit (her own checkbox); not shipped from this chat |

## 7. Compatibility and rollback

- Older image (`ddd221b`) on the migrated DB: its migrator stops at `0005`; its `select()`s don't
  name `incrementLbs`; its inserts omit it → NULL = global step. Checked on a copy (§9).
- Older backend + newer UI: the field is stripped (step doesn't save); responses lack it →
  `?? global`. ExerciseForm never sends a PUT of only the new field.
- Older UI + newer backend: never sends it; responses gain one field.
- Newer export → older instance: step stripped (accepted).
- Rollback = old tag, no restore; steps set meanwhile come back on roll-forward. No loss. The old
  UI's old progression rule comes back with it.

## 8. Tests

Backend: create without/with step, PUT step alone → 200, PUT `null` clears, 0 / −1 / 101 → 400;
export carries it; import with/without; program + workout duplicate keep it; `/sessions/:id`
exercises carry it; migrations test: 7 migrations, existing rows NULL, an insert omitting the
column succeeds.

Frontend: `progression.test.ts` — the replayed cases (35 12/8/8 on 8-12 → up; 12/10/7 → hold;
ramp 95/115/135×8 on 5-8 → up from 135; assisted −40×10,10,8 on 6-10 → −35; per-exercise step;
deload fires only with stall 3 + below range; light lift no deload; rounding table; no history → no
deload). `programEdit.test.ts` — add/remove/update/reorder, step omitted vs set, new workout,
unmatched workouts untouched, cardio kept, empty diff and emptied workout rejected. `tools.test.ts`
— normalizers. `dossier.test.ts` — program block step.

## 9. Ship notes

_(filled in after staging)_
