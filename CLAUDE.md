# Workout Tracker — Personal Edition

## What This Is

A self-hosted workout tracking app built with TypeScript, React, and Express.

**This is a personal app.** Single user, self-hosted, used at the gym on a phone. No multi-user, no cloud sync, no enterprise features.

---

## Core Philosophy

### Smart Frontend, Dumb Backend

| Layer | Responsibility |
|-------|----------------|
| **Frontend** | All UX logic, "What's Next?" calculation, sorting, filtering, optimistic updates |
| **Backend** | Validation + persistence only. No business logic. |

**Why?** The phone is powerful. The UI should be instant. The server is just a backup drive that validates before saving.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | Express + TypeScript + Sequelize ORM |
| Database | SQLite (self-contained) |
| Data Fetching | TanStack Query (React Query) |
| State | React Context for global state (timer, theme, offline status) |
| Validation | Zod (backend request validation) |

---

## Sacred Rules (NON-NEGOTIABLE)

| Rule | Constraint |
|------|------------|
| Tables | 5 maximum: Programs, Workouts, Exercises, Sessions, Sets |
| Database | SQLite only — no Postgres, no migrations framework |
| State | React state + TanStack Query + Context only — NO Redux, NO Zustand |
| Design | Mobile-first — this runs on a phone at the gym |
| Units | Pounds (lbs) for weight |
| Auth | None — self-hosted behind VPN |

---

## Database

Database lives at `backend/database.sqlite`. Sequelize creates tables on first run.

## Database Schema

**Do not change the schema** unless absolutely necessary (and document why).

### Tables & Relationships

```
Program (id, name, isActive, isArchived, currentWorkoutIndex, createdAt, updatedAt)
└─> Workout (id, programId, name, orderIndex, createdAt, updatedAt)
    └─> Exercise (id, workoutId, name, targetSets, targetReps, orderIndex, supersetGroup, createdAt, updatedAt)

Session (id, programId, workoutId, programName, workoutName, completedAt, isAdHoc, createdAt, updatedAt)
└─> Set (id, sessionId, exerciseId, exerciseName, weight, reps, setNumber, perceivedEffort, dropIndex, createdAt, updatedAt)
```

### Key Patterns

| Pattern | How It Works |
|---------|--------------|
| **History Independence** | Sessions store `programName`/`workoutName`, Sets store `exerciseName` at creation time. History survives if programs/exercises are deleted. |
| **Soft Delete** | Programs use `isArchived` flag, not hard delete |
| **Cascade Strategy** | Workouts/Exercises cascade delete with Program. Sessions use SET NULL on foreign keys to preserve history. |
| **Active Program** | Exactly one program has `isActive: true` at any time |
| **"What's Next?"** | `currentWorkoutIndex` on Program advances on completion (modulo wrap to cycle through workouts) |
| **Ad-hoc Sessions** | `isAdHoc: true` on Session means it doesn't advance the program index |
| **Ad-hoc Exercises** | `exerciseId: null` with `exerciseName` stored — added mid-workout |
| **Supersets** | `supersetGroup` field (letters A-E) groups exercises that rotate together |
| **RPE Scale** | `perceivedEffort` is 1-10 |
| **Drop Sets** | `dropIndex` field on Sets — standard sets have `dropIndex = 0`, drops have `1, 2, 3...` |

---

## Frontend Architecture (Feature-Based)

Code is organized by **domain**, not by type. All code for a feature lives together.

```
src/
├── features/
│   ├── active-session/            # THE core gym experience
│   │   ├── components/
│   │   │   ├── SetInput.tsx       # Weight/reps/RPE input
│   │   │   ├── ExerciseCard.tsx   # Single exercise with all its sets
│   │   │   ├── ExerciseNote.tsx   # Per-exercise note view/edit/clear widget
│   │   │   ├── SupersetStep.tsx   # Superset step — fixed-position cards, expand in place
│   │   │   ├── CompletionCelebration.tsx  # Session complete animation
│   │   │   ├── CompletedSessionSummary.tsx # Read-only view for already-completed sessions
│   │   │   ├── PlateCalculator.tsx
│   │   │   ├── SessionHeader.tsx
│   │   │   ├── AddExercise.tsx
│   │   │   ├── ExerciseListDropdown.tsx  # Exercise picker + drag reorder
│   │   │   └── RpePrompt.tsx      # Post-exercise RPE modal
│   │   ├── hooks/
│   │   │   ├── useActiveSession.ts    # Session state + optimistic updates
│   │   │   ├── usePrCelebration.ts    # Session-scoped PR detection + toast
│   │   │   ├── useHrWindow.ts         # HR window refs anchored to session start
│   │   │   ├── usePreviousData.ts     # Cached previous weights/reps
│   │   │   ├── useStartSession.ts     # Session initialization
│   │   │   ├── useExerciseNavigation.ts # Focused view navigation + supersets
│   │   │   ├── useAdHocExercises.ts   # Ad-hoc exercise state + set lookups
│   │   │   ├── useExerciseOrdering.ts # Single source of truth for order
│   │   │   └── useRpeFlow.ts          # RPE prompt orchestration
│   │   ├── logic/
│   │   │   ├── whatIsNext.ts      # "What's Next?" calculation (CLIENT-SIDE)
│   │   │   └── plates.ts          # Plate calculator math
│   │   └── index.tsx              # WorkoutSession page entry (~540 lines)
│   │
│   ├── program-builder/           # Program/workout/exercise CRUD
│   │   ├── components/
│   │   │   ├── ProgramCard.tsx
│   │   │   ├── WorkoutCard.tsx
│   │   │   └── ExerciseForm.tsx
│   │   ├── hooks/
│   │   │   └── usePrograms.ts
│   │   └── index.tsx              # Programs page entry
│   │
│   ├── history/                   # Past sessions
│   │   ├── components/
│   │   │   └── SessionCard.tsx
│   │   ├── hooks/
│   │   │   └── useHistory.ts
│   │   └── index.tsx              # History page entry
│   │
│   ├── progress/                  # Analytics & trends
│   │   ├── components/
│   │   │   ├── ExerciseProgressTab.tsx   # Per-exercise weight/volume over time
│   │   │   ├── VolumeTrendsTab.tsx       # Total volume trends with metric toggle
│   │   │   ├── PersonalRecordsTab.tsx    # All-time PRs
│   │   │   └── ProgressChart.tsx         # Reusable chart component
│   │   ├── hooks/
│   │   │   └── useProgressData.ts
│   │   └── index.tsx              # Tabbed progress page entry
│   │
│   ├── dashboard/                 # Home/landing page
│   │   ├── components/
│   │   │   ├── NextWorkout.tsx    # "What's Next?" display
│   │   │   ├── Calendar.tsx       # Month view with workout dots
│   │   │   ├── ResumeWorkout.tsx
│   │   │   ├── AdHocWorkoutPicker.tsx  # Quick workout modal
│   │   │   └── StatsCard.tsx
│   │   ├── hooks/
│   │   │   └── useNextWorkoutLocal.ts  # Client-side next workout calc
│   │   └── index.tsx              # Home page entry
│   │
│   └── coach/                     # AI Coach (opt-in, BYO API key)
│       ├── components/
│       │   ├── AiCoachSettingsCard.tsx  # Settings card: provider/model/key config
│       │   └── CoachMarkdown.tsx        # Markdown renderer for assistant bubbles
│       ├── lib/
│       │   ├── providers/
│       │   │   ├── types.ts           # Provider interface
│       │   │   ├── presets.ts         # Known providers (Anthropic, OpenAI, etc.)
│       │   │   ├── anthropic.ts       # Anthropic SDK adapter
│       │   │   ├── openaiCompatible.ts # OpenAI-compatible fetch adapter
│       │   │   └── index.ts           # createProvider factory
│       │   ├── coachLoop.ts           # Neutral agentic loop (tool calls)
│       │   ├── tools.ts               # Read-only tools over existing /api endpoints
│       │   ├── persona.ts             # System prompt
│       │   └── thread.ts              # localStorage thread persistence
│       └── index.tsx                  # Coach page entry
│
├── shared/
│   ├── ui/                        # Generic, reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx
│   │   ├── SwipeableRow.tsx
│   │   ├── TimerIndicator.tsx
│   │   └── ErrorBoundary.tsx      # Crash protection wrapper
│   ├── api/
│   │   ├── client.ts              # Axios instance, error handling
│   │   ├── types.ts               # Shared API request/response types
│   │   └── queries.ts             # TanStack Query definitions
│   └── context/
│       ├── TimerContext.tsx       # Global rest timer (survives navigation)
│       ├── OfflineContext.tsx     # Online/offline status
│       ├── ThemeContext.tsx       # Dark mode state
│       └── AiCoachContext.tsx     # AI Coach settings + enabled state
│
├── App.tsx                        # Router setup + context providers
└── main.tsx                       # Entry point
```

**Principle**: When debugging the session logger, everything is in `features/active-session/`. No hunting.

---

## Backend Architecture ("Dumb Storage")

The backend validates and persists. That's it.

```
backend/
├── src/
│   ├── routes/
│   │   ├── programs.ts      # CRUD for programs
│   │   ├── workouts.ts      # CRUD for workouts
│   │   ├── exercises.ts     # CRUD for exercises
│   │   └── sessions.ts      # CRUD for sessions + sets
│   ├── models/
│   │   ├── index.ts         # Sequelize instance + associations
│   │   ├── Program.ts
│   │   ├── Workout.ts
│   │   ├── Exercise.ts
│   │   ├── Session.ts
│   │   └── Set.ts
│   ├── middleware/
│   │   └── validate.ts      # Zod schema validation
│   ├── types/
│   │   └── index.ts         # Shared types (can be imported by frontend)
│   └── index.ts             # Express app setup
├── database.sqlite              # SQLite database
├── package.json
└── tsconfig.json
```

### What the Backend Does NOT Do
- ❌ Calculate "What's Next?" (frontend does this)
- ❌ Sort or filter history (frontend does this)
- ❌ Business logic decisions (frontend owns this)
- ❌ Complex queries (return raw data, frontend processes)

### What the Backend DOES
- ✅ Validate request bodies with Zod schemas
- ✅ Reject invalid data (negative weights, bad dates, missing fields)
- ✅ Persist to SQLite via Sequelize
- ✅ Return raw data for frontend to process
- ✅ Handle database transactions where needed

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/programs | List all programs with workouts/exercises |
| POST | /api/programs | Create program |
| PUT | /api/programs/:id | Update program |
| DELETE | /api/programs/:id | Archive program (soft delete) |
| PUT | /api/programs/:id/set-active | Set as active program |
| GET | /api/programs/:id/export | Export program as JSON |
| POST | /api/programs/import | Import program from JSON |
| POST | /api/programs/:programId/workouts | Create workout |
| PUT | /api/workouts/:id | Update workout |
| DELETE | /api/workouts/:id | Delete workout (cascade) |
| POST | /api/workouts/reorder | Reorder workouts |
| POST | /api/workouts/:id/reorder-exercises | Reorder exercises within a workout |
| POST | /api/workouts/:workoutId/exercises | Create exercise |
| PUT | /api/exercises/:id | Update exercise |
| DELETE | /api/exercises/:id | Delete exercise |
| GET | /api/exercises/suggestions | Autocomplete suggestions (name search) |
| GET | /api/exercises/history-by-name | Previous sets by exercise name |
| GET | /api/sessions/active | Find incomplete session (resume) |
| GET | /api/sessions/history | List completed sessions |
| GET | /api/sessions/stats | Summary statistics |
| GET | /api/sessions/export-csv | Export history as CSV |
| POST | /api/sessions/start | Start new session |
| POST | /api/sessions/:id/sets | Log a set |
| PUT | /api/sessions/:id/sets/:setId | Update a set (weight, reps, RPE) |
| DELETE | /api/sessions/:id/sets/:setId | Delete a set |
| PUT | /api/sessions/:id/complete | Complete session |
| DELETE | /api/sessions/:id | Delete session (cascades to sets) |
| GET | /api/sessions/:id/previous | Previous session hints |

---

## Key Features (Implemented)

### 1. Optimistic UI
- User taps "Log Set" → UI updates instantly
- API call happens in background
- If it fails, show error toast and revert
- No loading spinners during workouts

### 2. Persistent Rest Timer
- Lives in TimerContext, survives page navigation
- Web Notifications API for vibration/sound when complete
- Visual indicator in header when timer is running
- Background tab support with drift correction

### 3. Plate Calculator
- Input: target weight (e.g., 185 lbs)
- Output: plates per side assuming 45lb bar
- Standard plates: 45, 35, 25, 10, 5, 2.5
- Show inline or as quick modal during set logging

### 4. Drop Set Support
- Exercise can be marked for drop sets
- Log each drop as same `setNumber` but incrementing `dropIndex`
- Example: Set 1 (100lbs), Drop 1 (80lbs), Drop 2 (60lbs)

### 5. Dark Mode
- Manual toggle (Light/Dark)
- Persist preference in localStorage

### 6. PWA
- Manifest for "Add to Home Screen" icon
- No service worker (removed — stable VPN, no true offline need)

### 7. Program Export/Import
- Export any program as a portable JSON file (version 1 format)
- Import JSON to create a new program with all workouts and exercises
- Preview modal shows program name, workout count, exercise count before importing
- Exported files strip IDs, timestamps, and state flags

### 8. Session Delete
- Swipe left on a history card to reveal delete action
- Also accessible via Delete button in expanded card view
- `confirm()` dialog before deletion
- Cascades to delete associated sets
- Invalidates history, stats, and calendar queries

### 9. Focused Exercise View
- Active session shows one exercise at a time ("focused" view)
- Previous/Next navigation with step indicator
- Exercise list dropdown for quick navigation and drag-to-reorder
- Auto-advances when all target sets are logged
- Superset exercises grouped and rotate automatically

### 10. Per-Exercise RPE Prompt
- After completing all sets for an exercise, modal prompts for RPE (1-10)
- Applies RPE to all sets of that exercise
- Skip button to bypass

### 11. Inline Set Editing
- Tap any logged set row to enter inline edit mode
- Modify weight/reps directly, save or cancel
- Swipe-to-delete for removing sets

### 12. Ad-Hoc Workout Picker
- "Quick Workout" button opens picker modal
- Option for blank workout or select from existing programs/workouts
- Starts session with `isAdHoc: true`

### 13. Progress Page
- Tabbed interface: Exercise Progress, Volume Trends, Personal Records
- Exercise Progress: per-exercise weight/volume chart over time with metric toggle (Volume, 1RM, Weight)
- Volume Trends: total volume trends across all workouts
- Personal Records: all-time PRs by exercise with detailed set history
- Dark mode support with accessible tooltips

### 14. Completion Celebration
- Animated celebration when a session is completed
- Week streak display showing consecutive workout weeks

### 15. Add Exercise Mid-Workout
- During a program workout, "Add Exercise" button below exercise list
- Autocomplete suggestions from all exercise names (programs + history)
- Inserts at current navigation position and becomes active
- Uses negative ID convention (`-Date.now()`) to identify as ad-hoc
- Sets stored with `exerciseId: null` and `exerciseName` (history independence)
- Previous data hints fetched by exercise name via `/api/exercises/history-by-name`
- Does NOT modify the workout definition — session-only

### 16. BYO-Key AI Coach
- Opt-in chat coach at `/coach` — tab only shown when enabled in Settings
- Bring your own API key: supports Anthropic, OpenAI, OpenRouter, Google AI Studio, or any OpenAI-compatible endpoint
- Provider abstraction in `features/coach/lib/providers/` — Anthropic uses `@anthropic-ai/sdk` directly; all others use a fetch-based OpenAI-compatible adapter
- Neutral agentic loop (`coachLoop.ts`) handles tool call cycles across providers
- Read-only tools (`tools.ts`) over existing `/api` endpoints — the AI never writes the database
- "Build a program" flow emits version-1 export JSON into the existing import preview Modal (reuses the existing import path)
- Conversation thread persisted in localStorage
- Google AI Studio routed through `/ai-proxy/google/` nginx+Vite same-origin proxy (avoids CORS)
- Settings card: provider selector, model picker with live `listModels` fetch + free-text fallback, API key input, thread clear button
- Config in `shared/context/AiCoachContext.tsx`; backend untouched

---

## Established Patterns

These are conventions established in the codebase. New features should follow them.

### Mutation Hook
`useMutation` with `mutationFn`, `onSuccess` (invalidateQueries + toast.success), `onError` (toast.error).
Reference: `program-builder/hooks/usePrograms.ts`, `history/hooks/useHistory.ts`

### Destructive Action
`confirm('message')` before calling `mutation.mutate()`. No custom modals for destructive confirms.
Reference: `program-builder/components/ProgramCard.tsx`, `features/history/index.tsx`

### Swipe-to-Delete
Wrap content with `<SwipeableRow onSwipeLeft={handler} disabled={bool}>`. The component handles touch gestures and shows a red background with trash icon.
Reference: `features/history/index.tsx`, `shared/ui/SwipeableRow.tsx`

### File Download
Fetch as blob → create object URL → create anchor element → programmatic click → revoke URL.
Reference: `program-builder/components/ProgramCard.tsx`

### File Import
Hidden `<input type="file">` triggered by visible button click → parse file content → show preview in Modal → confirm action triggers mutation.
Reference: `features/program-builder/index.tsx`

### Query Keys
All query keys defined in the `queryKeys` object in `shared/api/queries.ts`. Array-based keys with factory functions for parameterized queries (e.g., `program: (id: number) => ['programs', id]`).

### Toast Notifications
`const toast = useToast()` then `toast.success('message')` or `toast.error('message')`. Never use raw `alert()`.
Reference: `shared/ui/Toast.tsx`

### Error Boundary
Wrap route components with `<ErrorBoundary>` to catch render errors. Use custom `fallback` prop for context-specific error UI.
Reference: `shared/ui/ErrorBoundary.tsx`, `App.tsx`

---

## Development Setup

### Production / Self-Hosted (Docker) — primary deployment

This is how the app actually runs day-to-day. `docker-compose up -d` from the repo root brings up two containers:

| Container | Host Port | Internal Port | Notes |
|-----------|-----------|---------------|-------|
| `workout-tracker-frontend` | 8035 | 80 (nginx) | Serves the built React bundle and proxies `/api/*` to the backend |
| `workout-tracker-backend`  | — (not exposed) | 3001 | Reachable only on the docker network |

The backend reads `DB_PATH=/data/database.sqlite`, mounted from the named volume `workout-tracker-data` (host: `/var/lib/docker/volumes/workout-tracker-data/_data/`). **This volume is the real database** — not anything in the repo.

To inspect live data:
```bash
# Hit the API from inside the container
docker exec workout-tracker-backend node -e \
  'require("http").get("http://localhost:3001/api/programs", r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>console.log(d))})'

# Or copy the live DB out for ad-hoc sqlite queries
docker cp workout-tracker-backend:/data/database.sqlite /tmp/live.sqlite
```

### Local dev (npm) — for code changes

Run the frontend and backend directly when iterating on code. This uses a **separate, throwaway** SQLite file at `backend/database.sqlite` (gitignored) — it has nothing to do with the docker volume.

| Layer | Port | Command |
|-------|------|---------|
| Backend | 3002 | `cd backend && npm run dev` |
| Frontend | 5174 | `cd frontend && npm run dev` |

If you need real data in dev, copy it out of the container first (`docker cp ...` above).

---

## Changelog

| Commit | Description |
|--------|-------------|
| 841bd3e | Phase 1: Foundation (Vite, Express, routing, dark mode, PWA skeleton) |
| 3749438 | Phase 2: Active session (set logging, optimistic UI, "What's Next?") |
| fff95b2 | Phase 3: Persistent rest timer with notifications |
| 1673588 | Phase 4: Plate calculator, drop set support, swipe gestures |
| 0f2b133 | Phase 5: Program builder, history view, dashboard calendar, PWA offline |
| c94db51 | Phase 6: Resume sessions, stats, CSV export, ad-hoc workouts, polish |
| 8749d28 | Fix: Sync TypeScript types with Zod schemas and model |
| 7437412 | Feature: Program export/import (JSON format) |
| 2ddc1b9 | Feature: Delete session from history (swipe + button) |
| — | UX Overhaul: focused exercise view, per-exercise RPE, inline set editing, ad-hoc picker |
| e241939 | Feature: Add exercise mid-workout with history auto-population |
| 273bbb7 | Cleanup: Remove deprecated /next-workout endpoint, fix UpdateProgramRequest type |
| 397903e | Resilience: Add ErrorBoundary, backend param validation |
| bb0d4a5 | Refactor: Extract focused hooks from ActiveSession (useAdHocExercises, useExerciseOrdering, useRpeFlow) |
| 519a323 | Docs: Update CLAUDE.md with new hooks, components, and patterns |
| 543ddfe | Fix: Stale state in RPE flow / auto-advance |
| bf2d797 | Feature: Calendar day click navigates to session in History |
| eda400b | Feature: Progress Page Phase 1 (Exercise Progress Tab) |
| d07757a | Feature: Progress Page Volume Trends Tab (Phase 2) |
| 040c7b2 | Feature: Personal Records Tab (Phase 3) |
| b36ae52 | Feature: Metric toggle (Volume, 1RM, Weight) on Progress Chart |
| 3127227 | Fix: RPE prompt now works for ad-hoc exercises |
| 58f775f | UX: Replace prompt() with Modal for adding workouts |
| cb992d2 | Feature: Show detailed set history in Progress tab |
| e1ffff7 | Fix: Exercise history lookup by name, case-insensitive matching |
| 327ec72 | Fix: Weight hints prioritize current session, preserve manual input changes |
| 865ebd9 | Remove service worker (stable VPN, no offline need) |
| bb1427a | UX: Tappable Up Next + remove inline timer |
| 1d0c5cd | Feature: Week Streak stats + Completion Celebration |
| 9d9afea | Fix: Add toast notifications to discardMutation + staleTime |
| 8ab5d53 | Fix: Add missing toast notifications to program mutations + staleTime |
| 29239f9 | Fix: SessionHeader shows workout name, Complete confirmation, session-scoped nav state |
| 4a4c1e0 | Fix: History staleTime, swipe confirmation, calendar highlight pagination |
| 9c148f1 | Fix: Progress page dark mode tooltips, 1RM calculation, dropdown, error states |
| — | Schema: Add `Session.exerciseNotes` JSON column (per-exercise notes captured in RPE prompt). Keyed by exercise name. Chose Session-level over Set-level to avoid replicating the same string across every set of an exercise. |
| c685617 | Feature: Auto-Progression — opt-in deterministic double-progression hint. When every working set tops the rep range at one weight, suggests a weight bump (default 5 lb) and resets reps to the bottom of the range. Pure logic + tests, localStorage context, Settings card. Session-time hint only; never edits the program. |
| — | Feature: BYO-Key AI Coach — opt-in chat coach in `features/coach/`. Multi-provider (Anthropic via `@anthropic-ai/sdk`; OpenAI/OpenRouter/Google AI Studio/Custom via a fetch-based OpenAI-compatible adapter). Provider abstraction in `lib/providers/`, neutral agentic loop (`coachLoop.ts`), read-only tools over existing `/api` endpoints (`tools.ts`), persisted thread in localStorage. Settings card with dynamic model fetch (`listModels`) + free-text fallback. AI never writes the DB — "build a program" emits version-1 export JSON into the existing import preview Modal. Google routed through a same-origin `/ai-proxy/google/` nginx+Vite proxy (no CORS header). Config in `shared/context/AiCoachContext.tsx`; `/coach` route + tab shown only when enabled. Backend untouched. Also extracted `epleyOneRepMax` to `shared/lib/oneRepMax.ts`. |
| — | UX: ExerciseCard interaction pass — whole logged-set row is the tap-to-edit target with a pencil hint at row end, full-width edit row (44px select-on-focus inputs + 44px Save/Cancel), note/swap header icons bumped to 44px hit areas, set rows min-h 44px. Note view/edit/clear widget extracted to `ExerciseNote.tsx`; ExerciseCard back under 500 lines. |
| — | UX: Superset fixed-position cards — cards stay in program order and the active exercise expands in place (no more physical reordering on rotation). Extracted superset block to `SupersetStep.tsx` with a `renderExerciseCard` render prop shared with the single-exercise branch (kills the duplicated ExerciseCard wiring). Collapsed-card tap now uses a direct `setSupersetActive(idx)` on the navigation hook instead of loop-rotating — tapping a completed card now reliably expands it. Rotation-after-set logic unchanged. |
| — | Fix: SetInput localStorage override leak — weight/reps overrides are now session-scoped (`wt:setinput:${sessionId}:...`, key builders in `lib/sessionStorage.ts`; SetInput reads sessionId from route params like CardioSetInput). `clearSessionLocalState` sweeps the prefix on complete/delete; dashboard discard now also calls `clearSessionLocalState` (was missing). One-time legacy sweep of unscoped `set-weight-*`/`set-reps-*` keys at app start (`main.tsx`). |
| — | UX: Coach polish — assistant bubbles render markdown via `react-markdown` + `remark-gfm` (`CoachMarkdown.tsx`; user messages stay plain, streaming draft renders live). Composer sticky offset now matches the tab bar exactly (`bottom-[calc(56px+env(safe-area-inset-bottom))]`). Starter chips send immediately instead of filling the input. Errors report once (in-thread ⚠️ bubble only; toast dropped). |
| — | Dark token sweep — migrated all `dark:(bg\|border\|hover:bg)-gray-(600-900)` surface styles (~60 across 19 files) to `surface-*` tokens. Added missing `surface-600` (#3F3F4E) and `surface-700` (#32323F) palette stops — coach/HeartRatePill already referenced surface-700 but the token didn't exist (classes were silently dead). Conventions: inputs `dark:bg-surface-900 dark:border-surface-800`; popovers `dark:bg-surface-800` + `border-surface-700`; borders/dividers/skeletons `surface-700`; hover on card `surface-700`, on page bg `surface-800`. SwipeableRow backdrop `gray-900`→`surface-800` (matches card; removed ExerciseCard's opaque-wrapper workaround). text-gray-* untouched. |
| — | Code health bundle — extracted `CompletedSessionSummary.tsx` from active-session index (633→542 lines); step↔flat-index math + "up next" scan moved into `useExerciseNavigation` (`flatIndexForStep`/`stepForFlatIndex`/`nextIncompleteExercise`; replaced `getCurrentFlatIndex`, `goToNext` shares the scan); PR detection extracted to `usePrCelebration.ts` and HR-window refs to `useHrWindow.ts` (useActiveSession 369→305 lines); raw `['history']`/`['stats']`/`['calendarSessions']` invalidations now use the `queryKeys` factory (added `calendarSessionsAll`); import-program mutation moved to `shared/api/queries.ts` as `useImportProgram` (coach no longer imports from program-builder; `useProgramMutations` delegates); ExerciseListDropdown drag hit-test scoped to a container ref instead of `document.querySelectorAll`. No behavior changes. |

---

## Style Guide

- **Tailwind**: Mobile-first, use `sm:` breakpoints for larger screens
- **Colors**: Indigo primary (`indigo-600`)
- **Components**: Small and focused, <500 lines per file
- **Types**: Strict TypeScript, no `any` unless absolutely necessary
- **Naming**: Feature folders are `kebab-case`, components are `PascalCase`
