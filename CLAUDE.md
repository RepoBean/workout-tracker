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
    └─> Exercise (id, workoutId, name, targetSets, targetReps, orderIndex, supersetGroup,
                  exerciseType, cardioModality, targetDurationSec, targetDistance,
                  createdAt, updatedAt)

Session (id, programId, workoutId, programName, workoutName, completedAt, isAdHoc,
         heartRateAvg, heartRateMin, heartRateMax, heartRateSeries, exerciseNotes,
         createdAt, updatedAt)
└─> Set (id, sessionId, exerciseId, exerciseName, weight, reps, setNumber, perceivedEffort,
         dropIndex, heartRateAvg, heartRateMax, durationSec, distance, createdAt, updatedAt)
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
| **Cardio Exercises** | `exerciseType` is `'strength'` (default) or `'cardio'`. Cardio exercises may set `cardioModality` (running/cycling/treadmill/rowing/other) and targets (`targetDurationSec`, `targetDistance`). Cardio sets store `durationSec`/`distance`; weight/reps are 0. |
| **Heart Rate** | From a BLE HR strap (Web Bluetooth). Sessions store `heartRateAvg/Min/Max` + `heartRateSeries` (JSON string of downsampled samples); Sets store per-set `heartRateAvg`/`heartRateMax`. All nullable — absent when no strap connected. |
| **Exercise Notes** | `Session.exerciseNotes` JSON column keyed by exercise name (captured in the RPE prompt). Session-level to avoid replicating one string across every set. |

---

## Frontend Architecture (Feature-Based)

Code is organized by **domain**, not by type. All code for a feature lives together.

```
src/
├── features/
│   ├── active-session/            # THE core gym experience
│   │   ├── components/
│   │   │   ├── SetInput.tsx       # Weight/reps input (strength)
│   │   │   ├── CardioSetInput.tsx # Cardio logging: live timer or manual duration + distance
│   │   │   ├── ExerciseCard.tsx   # Single exercise with all its sets
│   │   │   ├── ExerciseNote.tsx   # Per-exercise note view/edit/clear widget
│   │   │   ├── SwapExercise.tsx   # Swap exercise modal (session-only substitute)
│   │   │   ├── SupersetStep.tsx   # Superset step — fixed-position cards, expand in place
│   │   │   ├── CompletionCelebration.tsx  # Session complete animation
│   │   │   ├── CompletedSessionSummary.tsx # Read-only view for already-completed sessions
│   │   │   ├── LiveHRChart.tsx    # Live heart-rate chart panel (wraps SessionHRChart)
│   │   │   ├── PlateCalculator.tsx
│   │   │   ├── SessionHeader.tsx
│   │   │   ├── AddExercise.tsx
│   │   │   ├── ExerciseListDropdown.tsx  # Exercise picker + drag reorder
│   │   │   └── RpePrompt.tsx      # Post-exercise RPE modal (+ note capture)
│   │   ├── hooks/
│   │   │   ├── useActiveSession.ts    # Session state + optimistic updates
│   │   │   ├── usePrCelebration.ts    # Session-scoped PR detection + toast
│   │   │   ├── useHrWindow.ts         # HR window refs anchored to session start
│   │   │   ├── usePreviousData.ts     # Cached previous weights/reps
│   │   │   ├── useStartSession.ts     # Session initialization
│   │   │   ├── useExerciseNavigation.ts # Focused view navigation + supersets
│   │   │   ├── useAdHocExercises.ts   # Ad-hoc exercise state + set lookups
│   │   │   ├── useDiscardSession.ts   # Discard incomplete session (shared with dashboard)
│   │   │   ├── useExerciseOrdering.ts # Single source of truth for order
│   │   │   └── useRpeFlow.ts          # RPE prompt orchestration
│   │   ├── lib/
│   │   │   ├── sessionStorage.ts  # Session-scoped localStorage keys + cleanup sweep
│   │   │   └── virtualExercise.ts # Synthetic Exercise builder for ad-hoc/swap inserts
│   │   ├── logic/
│   │   │   ├── whatIsNext.ts      # "What's Next?" calculation (CLIENT-SIDE)
│   │   │   ├── plates.ts          # Plate calculator math
│   │   │   ├── personalRecord.ts  # PR (1RM) rules for celebrations (mirrors Progress filters)
│   │   │   ├── progression.ts     # Deterministic double-progression hint (+ tests)
│   │   │   └── averageRpe.ts      # Working-set RPE average (+ tests)
│   │   └── index.tsx              # WorkoutSession page entry (~580 lines)
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
│   │   │   ├── SessionCard.tsx
│   │   │   └── SessionHRChart.tsx # Heart-rate line chart (recharts; also used live)
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
│   ├── settings/                  # Settings page
│   │   └── index.tsx              # Profile (DOB/sex/HR for zones), auto-progression, AI coach card
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
│   │   ├── HeartRatePill.tsx      # Live BPM pill + HR zone badge (header)
│   │   ├── TimeInZoneBar.tsx      # Time-in-zone bar for a session HR series
│   │   └── ErrorBoundary.tsx      # Crash protection wrapper
│   ├── api/
│   │   ├── client.ts              # Axios instance, error handling
│   │   ├── types.ts               # Shared API request/response types
│   │   ├── queries.ts             # TanStack Query definitions
│   │   ├── predicates.ts          # isCardioExercise / isCardioSet type guards
│   │   └── cardio.ts              # Cardio modality display labels
│   ├── lib/
│   │   ├── hrZones.ts             # HR zone math: Karvonen/Gulati, zones, time-in-zone (+ tests)
│   │   └── oneRepMax.ts           # Epley 1RM estimate
│   ├── utils/
│   │   ├── format.ts              # formatMMSS, parseDurationToSec, etc. (+ tests)
│   │   └── heartRate.ts           # downsampleHr — bucket HR samples for storage/charts
│   └── context/
│       ├── TimerContext.tsx       # Global rest timer (survives navigation)
│       ├── OfflineContext.tsx     # Online/offline status
│       ├── ThemeContext.tsx       # Dark mode state
│       ├── HeartRateContext.tsx   # Web Bluetooth HR strap connection + live samples
│       ├── UserProfileContext.tsx # DOB/sex/resting+max HR profile (for zones)
│       ├── ProgressionContext.tsx # Auto-progression settings (enabled, increment)
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
│   │   └── validate.ts      # Zod schema validation (body + URL params)
│   ├── types/
│   │   ├── index.ts         # Shared types (can be imported by frontend)
│   │   └── associations.ts  # Typed Sequelize include shapes (ProgramWithWorkouts, etc.)
│   ├── migrations.ts        # Additive column migrations (duplicate-safe ALTER TABLE)
│   └── index.ts             # Express app setup
├── test/                    # Vitest + supertest API tests (in-memory SQLite, `npm test`)
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
| GET | /api/programs/:id | Get one program with workouts/exercises |
| POST | /api/programs | Create program |
| PUT | /api/programs/:id | Update program |
| DELETE | /api/programs/:id | Archive program (soft delete) |
| PUT | /api/programs/:id/set-active | Set as active program |
| POST | /api/programs/:id/duplicate | Duplicate program (with workouts/exercises) |
| GET | /api/programs/:id/export | Export program as JSON |
| POST | /api/programs/import | Import program from JSON |
| GET | /api/workouts/:id | Get one workout with exercises |
| POST | /api/workouts | Create workout (`programId` in body) |
| PUT | /api/workouts/:id | Update workout |
| DELETE | /api/workouts/:id | Delete workout (cascade) |
| POST | /api/workouts/:id/duplicate | Duplicate workout (with exercises) |
| POST | /api/workouts/reorder | Reorder workouts |
| POST | /api/workouts/:id/reorder-exercises | Reorder exercises within a workout |
| GET | /api/exercises/:id | Get one exercise |
| POST | /api/exercises | Create exercise (`workoutId` in body) |
| PUT | /api/exercises/:id | Update exercise |
| DELETE | /api/exercises/:id | Delete exercise |
| GET | /api/exercises/suggestions | Autocomplete suggestions (name search) |
| GET | /api/exercises/history-by-name | Previous sets by exercise name |
| GET | /api/exercises/all-sets-by-name | All-time sets by exercise name (PR check) |
| GET | /api/sessions/active | Find incomplete session (resume) |
| GET | /api/sessions/history | List completed sessions |
| GET | /api/sessions/stats | Summary statistics |
| GET | /api/sessions/export-csv | Export history as CSV |
| GET | /api/sessions/:id | Get one session with sets |
| GET | /api/sessions/:id/previous | Previous session hints |
| POST | /api/sessions/start | Start new session |
| POST | /api/sessions/:id/sets | Log a set |
| PUT | /api/sessions/:id/sets/:setId | Update a set (weight, reps, RPE, duration, distance) |
| DELETE | /api/sessions/:id/sets/:setId | Delete a set |
| PUT | /api/sessions/:id/exercise-note | Set/clear a per-exercise note |
| POST | /api/sessions/:id/complete | Complete session (accepts session HR summary) |
| DELETE | /api/sessions/:id | Delete session (cascades to sets) |

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

### 4. Drop Set Support (display only)
- No logging UI — the drop-set input mode was removed from SetInput (unused; schema retained for possible future use)
- Schema: `dropIndex` on Sets — standard sets `0`, drops `1, 2, 3...`
- Historical drop sets still display (indented orange rows in ExerciseCard, History, Progress) and support swipe-delete

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
| — | UX odds and ends — Discard Workout action on the active session screen (red text button at page bottom; `confirm()` → delete session → stop timer → navigate home). Discard mutation extracted to `hooks/useDiscardSession.ts` (DELETE + `clearSessionLocalState` + activeSession invalidation + toasts); dashboard Resume card now uses the same hook. Progress tab labels shortened to "Exercises / Volume / Records" so all three fit without horizontal scroll. |
| — | Cleanup: Drop-set dead code removal — removed unused `isDropSet`/`dropIndex` props and the orange drop input mode from `SetInput.tsx` (zero callers), plus the dead `dropIndex` field from ExerciseCard's `onLogSet` contract. Schema, historical drop-set display, and swipe-delete unchanged. |
| — | Feature: Cardio manual entry + edit + save robustness — "Enter manually" button on the cardio idle card opens the finishing form with a blank duration field; the finishing form's duration is now always editable (pre-filled from the timer after Finish), parsed by new `parseDurationToSec` in `shared/utils/format.ts` (accepts `m:ss`, `h:mm:ss`, plain/decimal minutes; +tests). Logged cardio rows in ExerciseCard now tap-to-edit duration/distance like strength rows (`onUpdateSet` contract widened with `durationSec`/`distance` — hook + backend already accepted them). Failed saves no longer lose the elapsed time: CardioSetInput clears its persisted timer state only after the POST succeeds (`onLogSet` gained an optional `{ onSuccess }` second arg, threaded ExerciseCard → page `handleLogSet`). Persist effect no longer rewrites identical JSON every 250 ms tick (`elapsedSec` dropped from deps); finishing-phase `durationStr` is persisted, manual entries persist without `startedAt`. |
| — | Fix: Blank-session ad-hoc exercises survive reload — `useAdHocExercises` now persists the blank-session `adHocExercises` list (full shape incl. `exerciseType`/`cardioModality`/targets) under `wt:adhoc-blank:${sessionId}` (the program flavor already owns `adhoc-exercises-${id}`), restored in the lazy initializer. Fixes Quick Cardio mid-run reload losing the seeded cardio card (no set logged yet, so reconstruction-from-sets couldn't recover it; re-adding produced a strength card). Key swept in `clearSessionLocalState`. Load/save helpers unified into generic `loadStoredList`/`saveStoredList`. |
| — | Perf: Kill 10 Hz re-renders from context providers — `TimerContext.tick()` now bails with the same state object when `timeRemaining` (whole seconds) hasn't changed, so the 100 ms drift-correction interval no longer re-renders every `useTimer` consumer (incl. the whole ActiveSession tree via `useActiveSession`) ten times a second during rest. Timer completion path (sound/vibration/notification, runs inside `tick()`) untouched. Provider `value` objects memoized with `useMemo` in `TimerContext`, `ToastContext` (consumers no longer re-render when a toast appears/expires), and `HeartRateContext`. No behavior changes. |
| — | Consistency + small-fix bundle — Progress bests (per-session bestWeight/bestVolume/best1RM in `getExerciseHistory` and the Personal Records tab) now exclude drop sets, matching the PR-celebration rules in `personalRecord.ts` (drop rows still shown in set lists). PersonalRecordsTab `indigo-*` → `primary-*` (teal). Dashboard discard now uses `confirm()` with set count (same wording as the active-session Discard); custom Modal deleted from `ResumeWorkout.tsx`. ExerciseCard `isBetter` green highlight requires one metric up and the other not down (100×9 no longer "beats" 185×8). `SessionHRChart` imports shared `formatMMSS` instead of a local copy. ExerciseListDropdown long-press drag moved to the `touch-none` drag handle (enlarged hit area) so dragging from the row body no longer scrolls the page; removed the no-op `preventDefault` in passive `onTouchMove`. |
| — | Cleanup: Dead code + hardening sweep — removed zero-caller exports: `useExerciseAllSetsByName` hook (PR check uses `queryClient.fetchQuery` directly; `ExerciseAllSet` type + `queryKeys.exerciseAllSets` kept), `getWorkoutByIndex` (whatIsNext.ts), `Toast()` stub export, `NextWorkoutResponse` type (referenced the removed `/next-workout` endpoint), `options?.onSetLogged` plumbing in `useActiveSession` (page wires completion via `logSet`'s per-call `onSuccess`), `updateExerciseInOrder` (useExerciseOrdering), `setsByExercise` dropped from `useAdHocExercises`' result interface (still used internally). Hardening: `useExerciseNavigation` persist effects include the storage keys in deps, and `useRpeFlow` now takes `sessionId` and resets `completedExercisesRef` when it changes — both guard a sessionId change without remount. No behavior changes. |
| — | Docs: CLAUDE.md drift fix (no code changes) — API table corrected against the live routers: complete is `POST` (was PUT), workout/exercise creation are flat `POST /api/workouts` + `POST /api/exercises` with the parent id in the body (was nested paths), added missing `GET :id` routes, `duplicate` endpoints, `all-sets-by-name`, and `exercise-note`. Schema diagram now lists the cardio columns on Exercises/Sets, HR columns on Sessions/Sets, and `exerciseNotes`; Key Patterns rows added for Cardio, Heart Rate, and Exercise Notes. Architecture tree caught up (CardioSetInput, SwapExercise, LiveHRChart, SessionHRChart, active-session `lib/` + logic files, `features/settings/`, HeartRatePill, TimeInZoneBar, `shared/lib` + `shared/utils`, predicates/cardio API helpers, HR/profile/progression contexts). Style guide color line fixed: teal `primary-*`, not indigo. |
| — | A11y: Modal + Calendar polish — `Modal` gets `role="dialog"`, `aria-modal="true"`, `aria-labelledby` wired to the title (`useId`), and an `aria-label="Close"` on the X button. Focus moves into the dialog on open (skipped when a child `autoFocus`es itself, e.g. the Add Workout input), restores to the opener on close, with a minimal Tab/Shift+Tab focus trap (query-based, no library). Calendar workout-day cells are now real `<button>`s with "View workout on {Month} {day}" labels (keyboard/AT operable — were `div onClick`); non-workout days stay plain spans. |
| — | Perf: Route code-splitting — all seven route components in `App.tsx` are now `React.lazy` behind one `Suspense` (spinner fallback matching the active-session loader). Provider stack (incl. `@anthropic-ai/sdk`) moved behind dynamic `import()` at call time: `AiCoachSettingsCard` imports `PROVIDER_ORDER`/`PROVIDER_PRESETS` from `lib/providers/presets` directly and loads `createProvider` inside "Load models"; coach `send()` loads it on first message. Entry chunk 1,211 kB → 301 kB (360 → 95 kB gzip); recharts (341 kB) loads with Progress/History/ActiveSession chunks, the coach markdown stack (175 kB) with the Coach tab, the SDK (158 kB) only on first send/model-fetch. The 500 kB build warning is gone. |
| — | Fix: Rest timer stuck at 0:01 on completion — `new Notification()` throws "Illegal constructor" on Android Chrome (page-scoped notifications need a service worker, which was removed), aborting `tick()`'s completion branch after the buzzer/vibration but before `setState(initialState)`, so the header indicator froze at the last second. Notification call now wrapped in try/catch, and state/localStorage cleanup reordered ahead of `triggerCompletion()` so completion effects can never strand the UI. |
| — | Docs: README drift fix (no code changes) — feature list gains AI Coach, auto-progression hints, cardio logging, live BLE heart rate, mid-workout add/swap, and plate calculator; stale "Offline support" bullet (service worker removed 865ebd9) reworded to the offline banner that actually exists. LLM-Friendly Workflow section now leads with the built-in coach. Local dev ports corrected (5174/3002, were 5173/3001) and dev script reference fixed to `start-dev.sh` (`start.sh` is the production build script). Project structure tree updated. Screenshots not retaken (programs-*.png predate the Jun 10 visual refresh). |
| — | Fix: Navigation bounced to exercise 1 after the first logged set when the user skipped ahead (occupied machine) — `useExerciseNavigation`'s smart-resume effect stayed armed on fresh sessions (the zero-sets early return never set `hasResumedRef`), so the first set re-fired the first-incomplete scan and reset the step. Resume decision is now one-shot: gated on a new `isReady` prop (session loaded; steps built — waits out the `orderedExercises` state sync) and disarms on every path. First hook-level tests in the suite (`useExerciseNavigation.test.ts`, renderHook; regression test verified to fail against the old code). |
| — | Fix bundle: Backend review round 1 + first backend tests — (1) workout duplicate now copies cardio fields (`exerciseType`/`cardioModality`/`targetDurationSec`/`targetDistance`; copies of cardio exercises silently became strength — program duplicate already copied them). (2) `validate()` assigns the Zod parse result back to `req.body`, so schema defaults/transforms/unknown-key stripping actually apply (import JSON omitting `workouts`/`exercises` 500'd before; now imports as empty). (3) `validateParams(idParamSchema)` wired into every `:id` route across all four routers — non-numeric ids returned 500, now 400; dead `validateQuery`/`parseParams` helpers removed. (4) Startup migrations extracted to `src/migrations.ts` — only `duplicate column name` errors are swallowed, anything else fails startup (was bare `catch {}` that ate locked-DB/disk errors too). (5) `isActive` dropped from the PUT `/api/programs/:id` schema and `UpdateProgramRequest` types (backend + frontend) — `/set-active` is the only path that changes it, making the single-active-program invariant unbreakable. First backend test suite: vitest + supertest over in-memory SQLite (`backend/test/`, 34 tests, `npm test`; forks pool — sqlite3 addon isn't worker-thread safe). Verified live against a copy of the production DB: boot migrations, all five fixes, full session lifecycle, dropped-column re-add. |
| — | UX: Blank ad-hoc ("Quick Workout") sessions now use the same focused view as program workouts — one exercise at a time, "Up next", collapsible All-Exercises dropdown with drag-reorder, resume-positioning, per-exercise RPE prompt, and previous weight/reps by name (the "what did I lift last time" hint that program ad-hoc exercises already got). Mechanism: `useAdHocExercises` now feeds blank-session exercises through `mergedExercises` as virtual Exercises (new `blankMergedExercises`, keyed by `hashName(name)` — deterministic, survives reload, collapses a blank-list entry and its logged-set twin to one id) instead of a separate flat list. `active-session/index.tsx` collapses its two render branches into one (focused view gated on `orderedExercises.length`, empty state otherwise) and unifies the Add-Exercise handler (blank appends to the blank list → flows to navigation; program path unchanged). Swap stays program-only. Program-path code is untouched (branch only changes the `exercises.length===0` case). Tests: new `useAdHocExercises.test.ts`; `useExerciseNavigation.test.ts` extended with all-negative-id (ad-hoc) coverage. |
| — | Fix: Silent 50-session history truncation — `GET /api/sessions/history` rejected any `limit > 100` and fell back to 50, so the Progress page (`useHistory(200,0)`) computed "all-time" Personal Records / Volume Trends / Exercise Progress from only the last 50 sessions, and the History page's 10th "Load More" (limit 101) shrank the list from 90→50 with sessions past 100 permanently unreachable (live DB has 70). Fix: out-of-range limits now **clamp toward the request, never below it** — `paginationQuerySchema.limit` clamps to `[1, 2000]` (a personal lifetime) instead of a `.max(100)` pipe that failed parse; the /history route dropped its stale `Math.min(…, 100)` (schema owns clamping). Non-numeric limit still falls back to the default 50. Progress `useHistory(200)`→`1000`, coach `getPersonalRecords` fetch `100`→`1000` (both summarize client-side; payload unchanged). History paging untouched — clamp semantics make its growing-limit paging correct up to 2000. Tests: 4 new /history limit-contract cases in `backend/test/sessions.test.ts`. |

---

## Style Guide

- **Tailwind**: Mobile-first, use `sm:` breakpoints for larger screens
- **Colors**: Teal primary via the `primary-*` scale (`primary-600` = #0d9488); amber `accent-*`; dark surfaces use `surface-*` tokens (never `dark:*-gray-*`)
- **Components**: Small and focused, <500 lines per file
- **Types**: Strict TypeScript, no `any` unless absolutely necessary
- **Naming**: Feature folders are `kebab-case`, components are `PascalCase`
