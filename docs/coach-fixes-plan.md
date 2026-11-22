# Coach Accuracy & Caching Fixes (Targeted Follow-Up)

Status: **Implemented, not yet shipped** (2026-11-22)  
Scope: **Frontend only** — no schema change, no backend change, no new endpoint, no APK rebuild.

> **Handoff note for the executing agent:** Read this plan alongside `CLAUDE.md`, `frontend/src/features/coach/lib/dossier.ts`, `frontend/src/features/coach/hooks/useCoachDossier.ts`, `frontend/src/features/coach/lib/tools.ts`, `frontend/src/features/coach/lib/persona.ts`, `frontend/src/features/coach/lib/providers/openaiCompatible.ts`, and `frontend/src/shared/lib/liftTrend.ts` before making edits. Stay strictly within the 4 targeted fixes below — **do not** add new heavy dossier sections (rest times, HR zones, multi-month volume tables, etc.).

---

## 1. Goal

Fix four concrete accuracy and efficiency bugs uncovered during a live-data review of the AI Coach, keeping the dossier lean for quick gym/phone use:

1. **Inject deterministic `computeProgression()` hints into the Active Program block** so the coach never has to do 7%-per-rep jump math in its head and always agrees with the active-session screen.
2. **Fix `get_workout_history` to match catalog aliases (`catalogId`)** so merged lifts (e.g., `Low Incline Dumbbell Press` / `Low Incline DB Press`) don't silently drop history when queried by their catalog name.
3. **Make `stallRun()` RPE-drop aware** (when matching/beating reps at the same top weight at a clearly lower RPE) so a lift moving from `155×8×3 @10` to `155×8×3 @8` isn't flagged `[stalled]` right next to a `Try: 160 ↑` progression hint.
4. **Enable prompt caching for Anthropic models on OpenRouter** (`cache_control: { type: 'ephemeral' }`) and update the stale heart-rate coverage claim in `persona.ts`.

---

## 2. Detailed Changes

### 2.1 Deterministic progression hints in the Active Program block (`dossier.ts`, `useCoachDossier.ts`, `persona.ts`)

**Problem today:**  
`persona.ts` (line 30) explains the jump-aware double-progression rule in prose and expects the LLM to compute rep allowances mentally (`~1 rep per 7% of jump`) and infer whether each active-program exercise should bump, hold, or reset. On real data, the model miscalculates this (e.g., telling the user to wait for `10/10/10` on assisted Pull-Ups when the app's rule only needed `10/7/7`).

**Design:**
1. Extend `buildProgramBlock()` in `frontend/src/features/coach/lib/dossier.ts` with optional context parameters (keeping backwards compatibility for existing callers/tests that only pass `programs`):
   ```ts
   export interface ProgramHintContext {
     recentSessions: Session[];
     progression: ProgressionSettings;
     latestBodyweight: number | null;
     catalog?: CatalogNames;
   }
   export function buildProgramBlock(programs: Program[], hints?: ProgramHintContext): string
   ```
2. When `hints && hints.progression.enabled` is true, for each non-cardio exercise `e` in the active program:
   - Gather working sets from `hints.recentSessions` that match the exercise by catalog identity (`e.catalogId != null && s.catalogId === e.catalogId`, falling back to case-insensitive `s.exerciseName.trim().toLowerCase() === e.name.trim().toLowerCase()` when either `catalogId` is null).
   - Find the **newest completed session** containing matching working sets (note `recentSessions` is newest-first; sort defensively by `completedAt` desc or take the newest date) to supply `previousSets` (raw signed weights, never effective load).
   - If no sets exist in `recentSessions`, omit the hint (nothing meaningful to prefill for a lift untrained in 20+ sessions).
   - Build `history = historyFromSets(...)` across all matching sets in `recentSessions` (covers the 3-session deload check without needing the full all-time payload or complicating `ALLTIME_STORAGE_KEY`).
   - Call `computeProgression({ previousSets, targetReps: e.targetReps, incrementLbs: e.incrementLbs ?? hints.progression.incrementLbs, history, bodyweight: hints.latestBodyweight, targetSets: e.targetSets })` from `../../active-session/logic/progression`.
   - Append the computed hint inline on the exercise entry, e.g.:
     - `Squat 3 × 5-8 [next: Last: 155×8 → Try: 160 ↑]`
     - `Lateral Raise 3 × 10-15 (superset A) [next: Aim 10×18 on every set → then 15]`
   - Keep `buildProgramBlock` pure (no `new Date()`, no fetches) so prompt-cache stability is preserved.
3. In `frontend/src/features/coach/hooks/useCoachDossier.ts`:
   - Pass `{ recentSessions, progression, latestBodyweight: latestWeighIn(weighIns)?.weight ?? profile.bodyweight, catalog }` into `buildProgramBlock(...)`.
   - Because `buildProgramBlock` runs outside the memoized `allTime` localStorage cache, editing a program, toggling auto-progression, or changing `incrementLbs` updates hints immediately with zero cache staleness.
4. In `frontend/src/features/coach/lib/persona.ts`:
   - Simplify line 30 so it tells the coach: when auto-progression is on, each active-program exercise carries the app's exact `[next: ...]` progression hint computed from the user's recent history — follow and reference those hints rather than recalculating rep allowances by hand, and briefly explain the rule only if the user asks why.

---

### 2.2 Catalog-aware exercise matching in `get_workout_history` (`tools.ts`, `coach/index.tsx`)

**Problem today:**  
`buildAllTimeBlock` groups lifts by `catalogId` (via `groupName`), so merged lifts show up under their canonical catalog name (e.g., `Low Incline Dumbbell Press`). However, `getWorkoutHistory` in `frontend/src/features/coach/lib/tools.ts` (lines 110–112, 150–161) filters sets purely by substring on raw `set.exerciseName`. On live data, calling `get_workout_history({ exerciseName: "Low Incline Dumbbell Press" })` misses **68 of 155 sets** (all 23 sessions logged as `Low Incline DB Press`).

**Design:**
1. Accept an optional catalog provider in `createCoachToolset` (`getCatalog?: () => CatalogEntry[] | undefined`).
   - In `frontend/src/features/coach/index.tsx`, pass a ref-backed getter reading `useCatalog().data` (already fetched by `useCoachDossier`, so zero extra network requests and `useMemo` for `toolset` stays stable).
   - Inside `getWorkoutHistory`, if `getCatalog` is absent or returns `undefined`, optionally fall back to `api.get<CatalogEntry[]>('/catalog')` wrapped in `try/catch` (non-fatal fallback to raw substring matching if `/catalog` is unavailable).
2. When `exerciseName` is provided:
   - Find every `CatalogEntry` where `matchesExercise(entry.name, exerciseName)` **or** `entry.aliases.some((a) => matchesExercise(a, exerciseName))`.
   - Collect their IDs into `matchedCatalogIds = new Set<number>(...)`.
   - A set matches if `(s.catalogId != null && matchedCatalogIds.has(s.catalogId)) || matchesExercise(s.exerciseName, exerciseName)`.
   - Preserve the `matchedNote` header listing all distinct `s.exerciseName` spellings found so the model sees both spellings when a lift was renamed/merged.
3. Export a small pure helper (e.g., `filterSessionsByExercise(sessions, exerciseName, catalog?)`) so it can be unit-tested cleanly without mocking Axios.

---

### 2.3 RPE-drop awareness in `stallRun()` (`liftTrend.ts`, `dossier.ts`, `liftOverview.ts`, `useCoachDossier.ts`)

**Problem today:**  
`stallRun()` in `frontend/src/shared/lib/liftTrend.ts` only checks `bestReps` and `totalReps` at the latest top weight. On live data, Squat went:
- `2026-10-26`: `155×8, 8, 8 @RPE 10`
- `2026-11-09`: `155×8, 8, 7 @RPE 8`
- `2026-11-16`: `155×8, 8, 8 @RPE 8`

Matching the same top-weight volume at **2 full RPE points lower** is clear strength/efficiency progress (and `computeProgression` marks it `Try: 160 ↑`), yet both Progress and the coach dossier flag it `[stalled 3 sessions @155]`.

**Design:**
1. Extend `DayTop` and `addToDayTop()` in `frontend/src/shared/lib/liftTrend.ts` with optional RPE tracking (backwards-compatible when omitted or `null`):
   ```ts
   export interface DayTop {
     weight: number;
     bestReps: number;
     totalReps: number;
     /** Sum and count of perceivedEffort on sets at `weight` (for average RPE). */
     rpeSum?: number;
     rpeCount?: number;
   }
   export function addToDayTop(
     day: DayTop | undefined,
     weight: number,
     reps: number,
     perceivedEffort?: number | null,
   ): DayTop
   ```
   - Helper `dayAvgRpe(d: DayTop): number | null` returns `d.rpeCount ? d.rpeSum! / d.rpeCount : null`.
   - When `weight > day.weight`, reset `rpeSum`/`rpeCount` to the new set's RPE (if `perceivedEffort != null`).
   - When `weight === day.weight`, accumulate `rpeSum`/`rpeCount` if `perceivedEffort != null`.
2. Update `stallRun(topByDate)` in `frontend/src/shared/lib/liftTrend.ts`:
   - Track the trailing run's best `bestReps`, best `totalReps`, and **lowest `avgRpe` achieved while matching or beating the current peak** (`bestRpeAtPeak: number | null`, initialized from `days[start]`).
   - On each subsequent day `i`:
     - **Rep improvement (existing rule):** `days[i].bestReps > bestReps || days[i].totalReps > totalReps` → `lastImproved = i`, update `bestReps`/`totalReps`, and reset `bestRpeAtPeak = dayAvgRpe(days[i])`.
     - **RPE-drop improvement (new rule):** If reps matched the peak (`days[i].bestReps >= bestReps && days[i].totalReps >= totalReps`), both `dayRpe` and `bestRpeAtPeak` are non-null, and `dayRpe <= bestRpeAtPeak - 1` (at least 1.0 RPE easier at equal performance) → `lastImproved = i`, `bestRpeAtPeak = dayRpe`.
   - Guardrails:
     - Missing RPE (`null`/`undefined`) never triggers an RPE improvement and never breaks existing behavior.
     - Doing **fewer** reps at a lower RPE (e.g., `155×8,8,7 @8` after `155×8,8,8 @10`) does **not** count as an improvement; matching or beating the peak reps at ≥1 RPE lower does.
3. Pass `set.perceivedEffort` to `addToDayTop(...)` in:
   - `frontend/src/features/coach/lib/dossier.ts` (`rollupExercises`, line 252)
   - `frontend/src/features/progress/logic/liftOverview.ts` (`buildLiftOverview`, lines 84 & 87)
   - (Keep `progression.ts` `historyFromSets` compatible — `perceivedEffort` is optional there and deload only fires when `bestReps < low` anyway.)
4. Bump `ALLTIME_FORMAT_VERSION` in `frontend/src/features/coach/hooks/useCoachDossier.ts` from `7` to `8` so cached all-time memos recompute on deploy.

---

### 2.4 OpenRouter Anthropic prompt caching + stale HR persona line (`openaiCompatible.ts`, `providers/index.ts`, `persona.ts`)

**Problem today:**
1. `openaiCompatible.ts` (lines 119–126) concatenates `system` and `systemCacheable` into one plain string `{ role: 'system', content: ... }`. OpenRouter requires explicit `cache_control: { type: 'ephemeral' }` on content blocks for Anthropic models (`anthropic/*` or `~anthropic/*`), so users running Claude via OpenRouter get **zero** prompt caching despite the pinned dossier.
2. `persona.ts` (line 26) hardcodes *"Heart rate is present on well under half of sessions"*, which is false on `main` (51% all-time, 95% of the last 20 sessions).

**Design:**
1. In `frontend/src/features/coach/lib/providers/openaiCompatible.ts`:
   - Add an optional `enableAnthropicCacheControl?: boolean` option to `createOpenAiCompatibleProvider`.
   - Allow `OpenAiMessage.content` to be `string | null | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>`.
   - When `opts.enableAnthropicCacheControl && systemCacheable` is set, emit the system message as:
     ```ts
     {
       role: 'system',
       content: [
         { type: 'text', text: system },
         { type: 'text', text: systemCacheable, cache_control: { type: 'ephemeral' } },
       ],
     }
     ```
     Otherwise keep the existing plain-string `{ role: 'system', content: ... }` format unchanged (preserving full compatibility with OpenAI, Google AI Studio, LM Studio, and other custom endpoints).
2. In `frontend/src/features/coach/lib/providers/index.ts`:
   - Pass `enableAnthropicCacheControl: settings.provider === 'openrouter' && /anthropic\//i.test(settings.model)`.
   - (Handles both `anthropic/claude-...` and OpenRouter's `~anthropic/...` aliases.)
3. In `frontend/src/features/coach/lib/persona.ts` (line 26):
   - Change *"Heart rate is present on well under half of sessions. Use it to colour a single session; never build a trend claim on it, and never read missing HR as missing effort."*
   - To: *"Heart rate is optional and absent whenever no strap was worn. Use it to colour sessions where it is present; never read missing HR as missing effort, and don't build trend claims across sessions with sparse HR."*

---

## 3. Files to Touch

| File | Change |
|---|---|
| `frontend/src/shared/lib/liftTrend.ts` | Optional `rpeSum`/`rpeCount` on `DayTop`; optional `perceivedEffort` param on `addToDayTop`; RPE-drop improvement check (`≥ 1.0` RPE lower at equal/greater `bestReps` & `totalReps`) in `stallRun` |
| `frontend/src/shared/lib/liftTrend.test.ts` | Unit tests for RPE-drop reset, lower-reps-at-lower-RPE non-reset, and missing-RPE fallback |
| `frontend/src/features/progress/logic/liftOverview.ts` | Pass `set.perceivedEffort` to `addToDayTop` |
| `frontend/src/features/coach/lib/dossier.ts` | Pass `set.perceivedEffort` to `addToDayTop`; add optional `hints?: ProgramHintContext` to `buildProgramBlock` using `computeProgression` |
| `frontend/src/features/coach/lib/dossier.test.ts` | Tests for progression hints in `buildProgramBlock` (up / hold / deload / auto-progression off / no recent sets / assisted lifts) and RPE-drop stall clearing |
| `frontend/src/features/coach/hooks/useCoachDossier.ts` | Pass `hints` context to `buildProgramBlock`; bump `ALLTIME_FORMAT_VERSION` from `7` → `8` |
| `frontend/src/features/coach/lib/tools.ts` | Catalog-aware `filterSessionsByExercise` matching `catalogId` via name + aliases; wire optional `getCatalog` into `createCoachToolset` |
| `frontend/src/features/coach/lib/tools.test.ts` | New (or extend existing) unit tests for alias/catalog matching in `filterSessionsByExercise` |
| `frontend/src/features/coach/index.tsx` | Pass ref-backed `getCatalog` from `useCatalog()` to `createCoachToolset` |
| `frontend/src/features/coach/lib/providers/openaiCompatible.ts` | Optional `enableAnthropicCacheControl` emitting content-block `cache_control: { type: 'ephemeral' }` on the system message |
| `frontend/src/features/coach/lib/providers/index.ts` | Enable `enableAnthropicCacheControl` when `provider === 'openrouter'` and model matches `/anthropic\//i` |
| `frontend/src/features/coach/lib/providers/openaiCompatible.test.ts` | New unit test verifying system payload shape with and without `enableAnthropicCacheControl` |
| `frontend/src/features/coach/lib/persona.ts` | Reference inline `[next: ...]` progression hints; replace stale HR coverage sentence |
| `CHANGELOG.md` | Add brief row when shipping |

No backend files, no database migrations, no API changes.

---

## 4. Test Plan

1. **`liftTrend.test.ts`:**
   - `155×8,8,8 @10` → `155×8,8,7 @8` → `155×8,8,8 @8` → `stallRun().sessions === 1` (`liftStatus` = `progressing`, not `stalled`).
   - `155×8,8,8 @10` → `155×8,8,7 @8` → `155×8,8,6 @8` (reps dropped even though RPE dropped) → still `stalled` (`sessions === 3`).
   - `155×8,8,8 @9` → `155×8,8,8 @8.5` (delta `< 1`) → still `holding`/`stalled`.
   - Same series with `perceivedEffort: null` → unchanged from existing behavior.
2. **`dossier.test.ts`:**
   - `buildProgramBlock` with `progression.enabled = true` appends `[next: Last: 155×8 → Try: 160 ↑]` for a ready lift, `[next: Aim ...]` for a hold lift, and `[next: Stuck ... → Reset: ...]` for a deload lift.
   - `buildProgramBlock` with `progression.enabled = false` emits no `[next: ...]` hints.
   - Active exercise with no sets in `recentSessions` emits no hint.
   - Active exercise matching via `catalogId` (e.g., `Low Incline DB Press` / `Low Incline Dumbbell Press`) picks up the newest session across merged spellings.
   - Cardio exercises never emit progression hints.
3. **`tools.test.ts`:**
   - Searching `"Low Incline Dumbbell Press"` with catalog `{ id: 10, name: "Low Incline Dumbbell Press", aliases: ["Low Incline DB Press"] }` returns sessions containing **both** spellings.
   - Searching `"incline"` still matches by substring even without catalog.
   - Searching a non-existent lift returns empty cleanly.
4. **`openaiCompatible.test.ts`:**
   - With `enableAnthropicCacheControl: true` and `systemCacheable` present, `messages[0]` is `{ role: 'system', content: [{ type: 'text', text: system }, { type: 'text', text: systemCacheable, cache_control: { type: 'ephemeral' } }] }`.
   - With `enableAnthropicCacheControl: false` (default), `messages[0]` remains `{ role: 'system', content: "${system}\n\n${systemCacheable}" }`.

**Verification commands:**
```bash
cd frontend && npm test && TZ=America/New_York npm test && npx tsc --noEmit
```

---

## 5. Compatibility & Rollback

- Pure frontend logic and request-formatting changes. Zero DB/API changes.
- Rollback = previous frontend image tag; `ALLTIME_FORMAT_VERSION` handles localStorage cache invalidation automatically in both directions.

---

## 6. Deployment Checklist (Per `CLAUDE.md`)

1. All frontend vitest tests pass (default TZ and `TZ=America/New_York`) and `npx tsc --noEmit` is clean.
2. Spot-check in staging against a seeded copy of `main`:
   - Squat no longer shows `[stalled]` on Progress or in the coach dossier, and shows `[next: Last: 155×8 → Try: 160 ↑]` in Active Program.
   - Asking the coach about `"Low Incline Dumbbell Press"` across 6+ months returns both spellings.
   - Verify OpenRouter request payload in DevTools Network tab (or unit test) carries `cache_control` without 400ing on `~anthropic/claude-sonnet-latest`.
3. Ship via `scripts/ship.sh staging` → verify → `scripts/ship.sh main` → `scripts/ship.sh wife` (never mid-workout).
