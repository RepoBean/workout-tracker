# v4 Bundle C4b: Progression v2 (jump-aware goal, reps past the range, step from the hint)

Status: **built 2026-11-11, on staging; main + wife pending.** Follows `docs/v4-bundle-c4-progression.md`.
Frontend only: no schema change, no backend change, no new endpoint, no APK.

## 1. What it does

1. **Go-up rule that knows the jump size.** Judged on last session's sets at its heaviest weight (as
   C4). Go up when **set 1 hit the top of the range and every set reached the goal**, where
   `goal = low + allowance` and `allowance = max(1, round(step / load × 15))`: the reps a set is
   expected to lose at the next weight. `load` is the weight moved (assisted: bodyweight − assistance;
   no usable load → allowance 1). Goal capped at 30 reps.

   | Lift (range, step) | Jump | Goal | Go up at |
   |---|---|---|---|
   | Leg Curl 80 (10-12, +2.5) | 3% | 11 | 12 / 11 / 11 |
   | Squat 155 (5-8, +10) | 6% | 6 | 8 / 6 / 6 |
   | Low Incline DB 50 (8-12, +5) | 10% | 10 | 12 / 10 / 10 |
   | OHP 35 (8-12, +5) | 14% | 10 | 12 / 10 / 10 |
   | Split Squat 25 (8-10, +5) | 20% | 11 | 11 / 11 / 11 |
   | Lateral Raise 10 (10-15, +5) | 50% | 18 | 18 / 18 / 18 |
   | Deadlift 160 (5, +5) | 3% | 6 | 6 / 6 / 6 |

2. **Reps past the range.** When the goal is above the range's top, the hold target and the prefill
   climb past it (`suggestReps` gains `repCeiling`) instead of suggesting a jump that fails.
3. **Step from the workout hint.** The hint chip shows the step (`+5 ▾`) and is a button on program
   exercises: 2.5 / 5 / 10 / other, "use the default" to clear. It shows the step the lift has
   actually been moving in (`learnedStep`: most common increase among the last 5 bumps), never applied
   without a tap. Saves `Exercises.incrementLbs` with a full-exercise PUT. Virtual (ad-hoc / swap)
   exercises: plain chip, global step.
4. Hold copy: `Aim 35×12 on set 1, rest 10+ → then 40`, or `Aim 10×18 on every set → then 15` when
   the goal is at or past the top. Up and deload unchanged.

## 2. Why: replay over main (backup 2026-11-11)

- None of the 21 active exercises had a step set: the C4 field (form → Advanced) was never found.
- Recent C4-approved bumps landed below the range: OHP 35×12/10/8 → 40×10/9/6 (8-12), Split Squat
  25×10/9/8 → 30×6/6/7 (8-10), Leg Curl 80×12/10/11 → 82.5×10/10/8 (10-12).
- Epley is no use as the predictor: over 101 past bumps it over-predicts the rep loss by 3.3 reps at
  k=30 (1.7 at k=15). Whole-history loss is ~1 rep/set at any jump size (beginner gains hide it);
  the recent 14-20% jumps lose 2-4. Hence a plain allowance, not a 1RM formula.

Each rule over every consecutive session pair of a lift with a known range. "Fires" uses the lift's
typical step; for the bumps Jason actually made, "landed" = every top set of the next session ≥ `low`.

| Rule | Fires (all, 547 pairs) | Real bumps approved: landed / missed | Fires (since 2026-05-11, 281) | Approved: landed / missed |
|---|---|---|---|---|
| Pre-C4 (every set at the top) | 110 | 40 / 9 (82%) | 32 | 16 / 6 (73%) |
| C4 (set 1 top, rest in range) | 173 | 51 / 14 (78%) | 72 | 19 / 11 (63%) |
| Goal only, K=15 (no set-1 condition) | 136 | 46 / 8 (85%) | 56 | 18 / 6 (75%) |
| **Shipped: set 1 top + goal, K=15** | 73 | 32 / 7 (82%) | 33 | 15 / 6 (71%) |

- K = 10, 15, 20 score the same (the allowance only changes on jumps ≥ ~10%); 25 fires too rarely. 15.
- **Honest reading:** the samples are small. The shipped rule approves about as rarely as the pre-C4
  rule and lands about as often; what it adds is the right shape (small steps earn the bump sooner
  than "all at the top", big steps later) and no failed 10 → 15 jumps. It fires less than half as
  often as C4, which is the "more reps before going up" Jason asked for.
- "Goal only" scored slightly better but goes up at 9/9/9 on an 8-12 lift with a small step: weight
  added at the bottom of the range, the linear scheme rejected in C4 D3. Not shipped.

## 3. Decisions (Jason, 2026-11-11)

| # | Decision |
|---|---|
| D1 | Go-up rule adapts to the jump size, calibrated on his history |
| D2 | Step is set from the workout hint, with the learned step offered |
| D3 | A jump too big for the range: keep adding reps past the range |
| D4 | Per-lift only; weekly muscle volume stays in C5 |
| D5 (Claude, flagged) | Kept C4's "set 1 at the top" beside the goal, against the approved plan's "small jumps go up before the top", because that is C4 D3's rejected linear scheme |

## 4. Code

- `active-session/logic/progression.ts`: `repAllowance`, `goalReps`, `learnedStep`, `REP_LOSS_PER_JUMP`,
  `GOAL_REP_CAP`; `ProgressionInput.bodyweight`; `ProgressionResult.goalReps` / `nextWeight`.
- `active-session/logic/suggestReps.ts`: optional `repCeiling` (default = top of the range; unchanged
  behaviour without it).
- `active-session/components/StepPicker.tsx` (new): `ProgressionChip` + the picker modal.
  `ExerciseCard.tsx` uses it and passes the latest bodyweight (`useBodyweightAt`).
- Copy: Settings → Auto-Progression, coach `persona.ts`. Program block unchanged → no
  `ALLTIME_FORMAT_VERSION` bump.
- C4 tests changed on purpose: OHP 12/8/8 now holds; a fixed target ("5") needs 6s; hold copy.

## 5. Compatibility

Nothing server-side. An older backend strips `incrementLbs` from the PUT (step doesn't save, the body
is still a full exercise → 200). Rollback = old tag; steps set meanwhile stay in the DB.

## 6. Ship notes

- Frontend 346 tests (also under `TZ=America/New_York`), `tsc` clean. Backend untouched.
- Staging (`dc7a524-dirty`, seeded from main 2026-11-11), headless Pixel 7: Full Body C, Split Squat
  (last 30×8/7/5, 8-10) shows `Aim 30×11 on every set → then 35` with `+5 ▾` and prefills 30×9; the
  picker offers "You've been going up 5 lb"; 2.5 saves → `Aim 30×10 on set 1, rest 9+ → then 32.5`;
  "Use the default" restores it. The test session was deleted afterwards.
- Found and fixed on staging: the chip kept the old step until a reload, because
  `useExerciseOrdering` holds its own copy of the exercises. It now refreshes `incrementLbs` (only)
  from the session query.
- Not checked in the browser: a virtual exercise's plain chip, an assisted lift (staging has no
  weigh-ins, so it takes the allowance-1 path).
