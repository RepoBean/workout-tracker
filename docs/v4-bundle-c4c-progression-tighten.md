# v4 Bundle C4c: Progression Tightening (Back-Off Guard, Step-Aware Reset, Copy Sync)

Status: **Implemented** (§2.5 not applied: no 15+ rep lifts in either instance's programs, 2026-11-21) (follows `docs/v4-bundle-c4-progression.md` and `docs/v4-bundle-c4b-progression-v2.md`).  
Scope: **Frontend only** — no schema change, no backend change, no new endpoint, no APK rebuild.

> **Handoff note for the executing agent:** Read this plan alongside `CLAUDE.md`, `docs/v4-bundle-c4b-progression-v2.md`, and `frontend/src/features/active-session/logic/progression.ts` before making edits. Stay strictly within the scope below; **RPE integration is intentionally deferred** to a follow-up bundle (§7).

---

## 1. Goal

Tighten the deterministic double-progression engine based on an exercise-science and code-level review, fixing real edge cases without changing the core jump-aware double-progression philosophy:

1. **Prevent false-positive weight bumps after mid-exercise weight drops or cut-short sessions** (`topSetsOf` / `computeProgression`).
2. **Make the 10% plateau reset respect the exercise's own `incrementLbs`** instead of hardcoding 5 lb rounding, and clarify "weight reset" vs. true fatigue deload in copy.
3. **Scale bodyweight (`weight = 0`) lift jumps against bodyweight** when bodyweight is known (consistent with assisted lifts).
4. **Fix copy drift** in Settings and the AI Coach system prompt so they match the real rule in code (including the "set 1 at top of range" requirement).
5. **(Optional / verify before changing)** Check whether `repAllowance` needs mild high-rep scaling (`15–25+` reps) — keep flat `K = 15` unless a history check or user preference justifies changing it.

---

## 2. Detailed Changes

### 2.1 Guard against dropped-weight sets & cut-short sessions (`progression.ts`, `ExerciseCard.tsx`)

**Problem today:**  
`topSetsOf()` in `frontend/src/features/active-session/logic/progression.ts` takes `working.filter((s) => s.weight === top)` and discards every other set.
- Ramp-up sets *before* the top weight (e.g., `95×8, 115×8, 135×8` on `5-8`) are correctly ignored.
- **Bug 1 (fatigue drop / back-off):** If the lifter drops weight *after* hitting the top weight because of fatigue (e.g., `100×12, 100×10, 90×10` on `8-12`, or assisted `-40×10, -30×10, -35×8`), the lighter trailing set is silently discarded and the remaining top sets (`12, 10`) falsely trigger `kind: 'up'`.
- **Bug 2 (cut-short session):** If `exercise.targetSets` is `3` and the lifter only logged `1` set (`100×12`) before stopping early, `sets` has length `1` and falsely triggers `kind: 'up'`.

**Design:**
1. Extend `ProgressionInput` in `frontend/src/features/active-session/logic/progression.ts` with an optional field:
   ```ts
   /** Prescribed working sets for this exercise (optional). Prevents cut-short sessions from bumping. */
   targetSets?: number;
   ```
   Pass `targetSets: exercise.targetSets` from `ExerciseCard.tsx` (only caller of `computeProgression`). Keep it optional so existing callers/tests without it remain backwards-compatible.
2. In `topSetsOf(previousSets)`:
   - Sort working sets (`(s.dropIndex || 0) === 0`) by `setNumber`.
   - Find `top = Math.max(...working.map((s) => s.weight))` and `firstTopIdx = working.findIndex((s) => s.weight === top)`.
   - Sets before `firstTopIdx` are ramp-up sets (ignored, preserving `95/115/135×8 → up`).
   - Compute `droppedWeightAfterTop = working.slice(firstTopIdx + 1).some((s) => s.weight < top)`.
   - Return `{ top, sets: working.filter((s) => s.weight === top), workingCount: working.length, droppedWeightAfterTop }`.
3. Update the `kind: 'up'` gate in `computeProgression`:
   - Require **all** of:
     - `!droppedWeightAfterTop`
     - `targetSets == null || workingCount >= targetSets`
     - `sets[0].reps >= high && sets.every((s) => s.reps >= goal)`
   - Note: `workingCount >= targetSets` (total working sets, NOT `sets.length >= targetSets`) deliberately preserves ramp-up sessions like `95/115/135×8` on `targetSets: 3`.
4. **Clear hold copy when blocked by a weight drop or incomplete session:**
   - If the top sets themselves met `sets[0].reps >= high && sets.every((s) => s.reps >= goal)` but the bump was blocked:
     - If `droppedWeightAfterTop`: e.g. `` `Keep ${formatWeight(top)} on all sets → then ${formatWeight(nextWeight)}` ``
     - Else (`workingCount < targetSets`): e.g. `` `Complete all ${targetSets} sets at ${formatWeight(top)} → then ${formatWeight(nextWeight)}` ``
   - Otherwise keep the existing hold copy unchanged.
5. `couldDeload` behavior stays unchanged (still checks `bestReps < low` on `sets` at `top`).

---

### 2.2 Step-aware reset rounding (`deloadWeight` in `progression.ts`)

**Problem today:**  
`DELOAD_ROUND_LBS = 5` is hardcoded in `progression.ts`. On a `2.5 lb` pin-stack machine (or a `20 lb` lift with `2.5 lb` micro-plates), a 10% drop rounds to 5 lb increments—or rounds right back to the same weight and silently suppresses the reset. On a `10 lb`-only weight stack, rounding to `5` can suggest a weight the stack doesn't have.

**Design:**
1. Update `deloadWeight(w: number, step = DELOAD_ROUND_LBS): number`:
   - Use `const roundStep = step > 0 ? step : DELOAD_ROUND_LBS;`
   - Compute `target = (w - DELOAD_FRACTION * Math.abs(w)) / roundStep;`
   - Round to nearest `roundStep`, ties going lighter:
     `const rounded = Math.ceil(Math.round(target * 1e6) / 1e6 - 0.5) * roundStep;`
   - Clean float precision (e.g. `Math.round(rounded * 100) / 100`) for fractional steps like `2.5` or `1.25`.
   - Return `rounded >= w ? w : rounded`.
2. In `computeProgression`, pass `incrementLbs`: `const lighter = deloadWeight(top, incrementLbs);`.
3. Keep `kind: 'deload'` in `ProgressionKind` (no churn to callers/types).
4. Clarify copy so it's honest about being a **10% weight reset** (not a systemic fatigue deload week):
   - Chip reason: `Stuck at ${formatWeight(top)} for ${stall.sessions} sessions → Reset: ${formatWeight(lighter)} ↓` (or keep `Try:` if preferred — check with user if unsure; `Reset:` makes the intent clearer).

**Sanity table for `deloadWeight(w, step)`:**
| `w` | `step` | Raw `-10%` | Result |
|---:|---:|---:|---:|
| `225` | `5` | `202.5` | `200` (unchanged) |
| `225` | `10` | `202.5` | `200` |
| `145` | `5` | `130.5` | `130` (unchanged) |
| `80` | `2.5` | `72.0` | `72.5` |
| `20` | `2.5` | `18.0` | `17.5` (now resets instead of sticking at 20) |
| `20` | `5` | `18.0` | `20` (unchanged — avoids a 25% drop to 15) |
| `10` | `5` | `9.0` | `10` (unchanged — avoids a 50% drop to 5) |
| `-30` | `5` | `-33.0` | `-35` (unchanged) |
| `-30` | `2.5` | `-33.0` | `-32.5` |

---

### 2.3 Bodyweight lifts (`top === 0`) load sizing (`progression.ts`)

**Problem today:**  
Line 190 of `progression.ts`:
```ts
const load = top > 0 ? top : top < 0 && bodyweight != null ? bodyweight + top : 0;
```
When `top === 0` (unweighted pull-ups/dips/push-ups) and `bodyweight` is logged, `load` falls back to `0` (`allowance = 1`) instead of using `bodyweight`.

**Design:**
```ts
const load = top > 0 ? top : bodyweight != null ? bodyweight + top : 0;
```
- `top > 0`: uses `top` (unchanged).
- `top < 0` with bodyweight: `bodyweight + top` (unchanged).
- `top === 0` with bodyweight: uses `bodyweight` so a big belt jump (e.g., `+25 lb` at `160 lb` BW = 15.6%) gets an appropriate allowance instead of `1`.
- No bodyweight: `0` → minimum allowance `1` (unchanged).

---

### 2.4 Sync Settings & AI Coach Copy (`settings/index.tsx`, `coach/lib/persona.ts`)

**Problem today:**  
Both `frontend/src/features/settings/index.tsx` (lines 309–315) and `frontend/src/features/coach/lib/persona.ts` (line 30) say the suggested weight goes up once every set reaches the rep goal, omitting:
- that **set 1 must also reach the top of the range**,
- that **all working sets must stay at the top weight** (no dropping weight on later sets), and
- that the 3-session fallback is a **10% weight reset rounded to the lift's step** (not a full fatigue-clearing deload week).

**Design:**
1. Update the Auto-Progression description in `frontend/src/features/settings/index.tsx` to concisely state:
   - Set 1 hits the top of the rep range and every set at that weight reaches the rep goal (`low + expected rep loss`, climbing past the range if the jump is big), without dropping weight on later sets.
   - Stuck for 3 sessions below the range → suggests a 10% weight reset (rounded to the lift's step).
2. Update line 30 of `frontend/src/features/coach/lib/persona.ts` to match the exact same rule and reset wording.
3. **Do NOT bump `ALLTIME_FORMAT_VERSION`** — the dossier's all-time block is untouched.

---

### 2.5 Optional Check: High-Rep `repAllowance` Scaling (Confirm Before Changing)

At higher rep ranges (`15–25+` reps), each rep represents a smaller percentage of 1RM (~1.5–2% vs. ~3–3.5% in the 5–10 range), so flat `K = 15` slightly under-predicts rep loss on 15–25 rep isolations.

- **Candidate formula** (anchored to `K = 15` at `low = 8` via Epley's `(30 + low)` slope):
  `scaledK = REP_LOSS_PER_JUMP * (30 + low) / 38`
  - Preserves every 5–12 rep lift in the C4b table identically.
  - Gently raises allowance by +1 rep on `20–25` rep lifts with large % jumps.
- **Instruction for the executing agent:** Do **not** blindly apply this without checking! Either:
  1. Ask the user if they want to keep flat `K = 15` (simpler, already replay-validated) or add mild `low` scaling, **or**
  2. If a DB backup/staging DB is available, check whether any 15–25 rep lifts in the user's history actually land short after bumps before changing `repAllowance`.

---

## 3. Files to Touch

| File | Change |
|---|---|
| `frontend/src/features/active-session/logic/progression.ts` | `targetSets?` on input; ramp vs. post-top weight drop in `topSetsOf`; hold reasons for dropped weight / short session; `deloadWeight(w, step)`; `top === 0` bodyweight load |
| `frontend/src/features/active-session/components/ExerciseCard.tsx` | Pass `targetSets: exercise.targetSets` to `computeProgression` |
| `frontend/src/features/active-session/logic/progression.test.ts` | Unit tests for all new cases (see §4) |
| `frontend/src/features/settings/index.tsx` | Update Auto-Progression card copy |
| `frontend/src/features/coach/lib/persona.ts` | Update progression rule line to match code |
| `CLAUDE.md` / `CHANGELOG.md` | Add brief changelog entry if shipping |

No backend files, no migrations, no API changes.

---

## 4. Test Plan

Add/update unit tests in `frontend/src/features/active-session/logic/progression.test.ts`:

1. **Weight drop after top weight holds:**
   - `100×12, 100×10, 90×10` on `8-12`, step `5` → `kind: 'hold'`, `suggestedWeight: 100`, reason explains keeping `100` on all sets.
   - `100×12, 90×10, 100×10` (dip in the middle) → `kind: 'hold'`.
   - Assisted `-40×10, -30×10, -35×8` on `6-10` → `kind: 'hold'` at `-30` (needed more help on set 3).
2. **Ramp-up sets before top weight still bump:**
   - `95×8, 115×8, 135×8` on `5-8`, step `10`, `targetSets: 3` → `kind: 'up'`, `suggestedWeight: 145`.
3. **Cut-short session holds when `targetSets` is provided:**
   - `100×12` alone on `8-12`, `targetSets: 3` → `kind: 'hold'`, reason mentions completing all 3 sets.
   - `100×12, 100×10` on `8-12`, `targetSets: 3` → `kind: 'hold'`.
   - `100×12` with `targetSets` omitted → still `kind: 'up'` (backwards compatibility).
4. **Step-aware `deloadWeight(w, step)`:**
   - Verify table in §2.2 (`80` w/ `2.5` → `72.5`; `20` w/ `2.5` → `17.5`; `20` w/ `5` → `20`; `-30` w/ `2.5` → `-32.5`; `225` w/ `10` → `200`).
   - End-to-end `computeProgression` deload test using `incrementLbs: 2.5` at `weight: 20` fires `kind: 'deload'`, `suggestedWeight: 17.5`.
5. **Bodyweight (`weight: 0`) jump scaling:**
   - `weight: 0`, `step: 25`, `bodyweight: 160` on `8-12` → `load = 160`, `allowance = 2`, `goalReps = 10` (holds at `12/9/9`, bumps at `12/10/10` → `25`).
   - `weight: 0`, `step: 5`, `bodyweight: null` → falls back to `allowance = 1`.

**Verification commands:**
```bash
cd frontend && npm test && TZ=America/New_York npm test && npx tsc --noEmit
```

---

## 5. Compatibility & Rollback

- Pure frontend logic + copy. Zero API/DB changes.
- Rollback = previous frontend image tag; no data migration or restore needed.

---

## 6. Deployment Checklist (Per `CLAUDE.md`)

1. All frontend vitest tests pass (default TZ and `TZ=America/New_York`) and `npx tsc --noEmit` is clean.
2. Spot-check in dev/staging:
   - Active session hint for a lift with a trailing lighter set holds instead of bumping.
   - Settings → Auto-Progression copy reads cleanly on mobile.
3. Ship following standard `staging → main → wife` workflow (never mid-workout).

---

## 7. Next Up (Explicitly Out of Scope for This Bundle): RPE-Aware Progression (Future C4d)

Once C4c is live and validated, a separate chat/bundle can explore incorporating `perceivedEffort` (already stored on sets and present on `PreviousSetData`):
- **Backtest first** against actual logged history (how often RPE is logged, distribution across compounds vs. isolations, and whether RPE distinguishes "landed" vs. "missed" bumps).
- **Candidate strength-focused rules to evaluate:**
  - Allow fixed-rep strength targets (e.g., `3×5` Deadlift) to bump at `5/5/5` when RPE ≤ 8.5 instead of forcing `6/6/6`.
  - Optional RPE ceiling guard on compounds (e.g., flag/hold if an RPE 10 grinder barely hit the goal, or soften the next jump).
  - Never penalize missing RPE (skipping the RPE prompt must fall back cleanly to the current deterministic rule).
