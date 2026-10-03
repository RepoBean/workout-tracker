# Workout Tracker — Personal Edition

## What This Is

A self-hosted workout tracking app built with TypeScript, React, and Express.

**This is a personal app.** One user per instance, self-hosted, used at the gym on a phone (the Android app, or the web app over the VPN). Two instances (Jason, wife) run the same images from one checkout — multi-instance, never multi-user. No cloud sync, no offline mode, no cross-device resume, no enterprise features.

---

## Core Philosophy

### Client owns interaction, server owns data

| Layer | Responsibility |
|-------|----------------|
| **Frontend** | Everything the user feels: "What's Next?", navigation, sorting/filtering for display, progression and rep hints, PR rules, optimistic updates, the coach |
| **Backend** | Validates (Zod), persists (Drizzle/SQLite), keeps identity straight (exercise catalog), answers indexed lookups (previous sets, all sets by name), exports. No product decisions. |

**Why?** The phone is powerful and the UI must be instant. The server is the durable copy plus the few
reads that would otherwise mean downloading everything. The original "dumb backend" rule was relaxed in
v3 (`docs/v3-plan.md` §2) — the line now is *data and lookups on the server, decisions on the client*.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | Express + TypeScript + Drizzle ORM (better-sqlite3) |
| Database | SQLite (self-contained); schema via drizzle-kit SQL migrations in `backend/drizzle/` |
| Data Fetching | TanStack Query (React Query) |
| State | React Context for global state (timer, theme, offline status) |
| Validation | Zod (backend request validation) |

---

## Sacred Rules (NON-NEGOTIABLE)

| Rule | Constraint |
|------|------------|
| Tables | Six: Programs, Workouts, Exercises, Sessions, Sets, ExerciseCatalog. A new table needs a written case in `docs/` first (v3 allowed exactly one; `SessionExercises` was parked on 2026-09-28) |
| Database | SQLite only. Schema changes are drizzle-kit SQL migrations in `backend/drizzle/`, applied at boot, **additive until an explicit cutover**. Never hand-edit the live DB. Dates stay in Sequelize's text format |
| Compatibility | The API only ever **gains** fields. An older frontend/APK must keep working against a newer backend, and an older backend image must boot on a newer DB (rollback = old tag, no restore) |
| Instances | One checkout, three compose profiles (main / wife / staging). Every change ships staging → main → wife, same commit. Never `docker compose down -v` |
| State | React state + TanStack Query + Context only — NO Redux, NO Zustand. Per-session localStorage keys are scoped by session id and swept on complete/discard |
| Design | Mobile-first — this runs on a phone at the gym |
| Units | Pounds (lbs). A kg toggle, if ever, is display-only |
| Auth | None — self-hosted behind VPN |
| Scope | No multi-user, no cloud sync, no offline mode, no cross-device resume (decided 2026-09-28; do not re-propose) |

---

## Database

Local dev database lives at `backend/database.sqlite` (throwaway). In Docker each instance has its own named volume (see Development Setup). On boot, `src/db/migrate.ts` runs the legacy column adds (table-guarded, pre-2026-06 DBs only) and then the drizzle-kit migrations in `backend/drizzle/` — the `0000_baseline` is `CREATE ... IF NOT EXISTS` (no-op on existing DBs, full create on a fresh one); applied ones are recorded in `__drizzle_migrations`. Last, `backfillCatalog()` (`src/db/catalog.ts`) fills any NULL `catalogId` from names — every boot, silent once converged. To change the schema: edit `src/db/schema.ts`, run `npx drizzle-kit generate --name=<what>`, review the SQL, commit `drizzle/`. Dates are stored in Sequelize's text format (`YYYY-MM-DD HH:MM:SS.SSS +00:00`, see `src/db/columns.ts`) so pre-Drizzle images can still read the DB.

## Database Schema

Schema changes go through drizzle-kit migrations and get a written reason: a `docs/` bundle doc for anything structural, a `CHANGELOG.md` row for a column.

### Tables & Relationships

```
Program (id, name, isActive, isArchived, currentWorkoutIndex, createdAt, updatedAt)
└─> Workout (id, programId, name, orderIndex, createdAt, updatedAt)
    └─> Exercise (id, workoutId, name, targetSets, targetReps, orderIndex, supersetGroup,
                  exerciseType, cardioModality, targetDurationSec, targetDistance,
                  catalogId, createdAt, updatedAt)

Session (id, programId, workoutId, programName, workoutName, completedAt, isAdHoc,
         heartRateAvg, heartRateMin, heartRateMax, heartRateSeries, exerciseNotes,
         createdAt, updatedAt)
└─> Set (id, sessionId, exerciseId, exerciseName, weight, reps, setNumber, perceivedEffort,
         dropIndex, heartRateAvg, heartRateMax, durationSec, distance, catalogId,
         createdAt, updatedAt)

ExerciseCatalog (id, name, aliases, createdAt, updatedAt)   ← Exercise.catalogId, Set.catalogId
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
| **Assisted Lifts** | `weight < 0` means assistance: `−40` = 40 lbs of help (assisted pull-up/dip). Floor is `-500` (backend Zod). Entry, prefill and progression keep the raw signed value (`−40 → −35` is progress); volume, 1RM, PRs, Progress bests and the coach all-time block use `effectiveWeight()` (`shared/lib/effectiveWeight.ts`) = profile bodyweight + weight, skipping the set when no bodyweight is set. Display via `formatWeight()` (real minus sign). No schema change. |
| **Drop Sets** | `dropIndex` field on Sets — standard sets have `dropIndex = 0`, drops have `1, 2, 3...` |
| **Cardio Exercises** | `exerciseType` is `'strength'` (default) or `'cardio'`. Cardio exercises may set `cardioModality` (running/cycling/treadmill/rowing/other) and targets (`targetDurationSec`, `targetDistance`). Cardio sets store `durationSec`/`distance`; weight/reps are 0. |
| **Heart Rate** | From a BLE HR strap (Web Bluetooth). Sessions store `heartRateAvg/Min/Max` + `heartRateSeries` (JSON string of downsampled samples); Sets store per-set `heartRateAvg`/`heartRateMax`. All nullable — absent when no strap connected. |
| **Exercise Notes** | `Session.exerciseNotes` JSON column keyed by exercise name (captured in the RPE prompt). Session-level to avoid replicating one string across every set. |
| **Exercise Catalog** | One `ExerciseCatalog` row per lift (unique on `lower(name)`, index `catalog_name_lower`), `aliases` JSON `string[]`. `Exercises.catalogId` / `Sets.catalogId` are nullable FKs with **no ON DELETE action** (a referenced row can't be deleted). **Names stay on every row and are authoritative**: the server derives `catalogId` from the name on every write (`resolveCatalogId` in `db/catalog.ts` — name, else alias, else insert); request schemas never accept `catalogId`, so old clients stay correct. `backfillCatalog()` runs every boot (after migrations): fills NULL ids (first boot, or rows an older image wrote during a rollback) and GCs unreferenced alias-less rows — silent once converged. Merge (Settings → Exercise catalog) folds B into A: re-points ids, B's name + aliases become A's aliases; split reverses it exactly. Neither ever rewrites `exerciseName`/`name`/`exerciseNotes` or a row's `updatedAt`. Readers that should see a renamed lift as one lift use catalog identity: `/previous`, `history-by-name`, `all-sets-by-name` (server), Progress + coach all-time rollup (client, `shared/lib/catalog.ts`). Per-session views (history cards, active session, notes, CSV) stay name-based by design. A program-exercise rename resolves to the new name's entry ("this slot now does a different lift"); "same lift, new spelling" is a merge. |

---

## Frontend Architecture (Feature-Based)

Code is organized by **domain**, not by type. All code for a feature lives together.

```
src/
├── features/
│   ├── active-session/            # THE core gym experience
│   │   ├── components/
│   │   │   ├── SetInput.tsx       # Weight/reps input (strength)
│   │   │   ├── AssistToggle.tsx   # lbs/assist unit button = sign switch for assisted lifts
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
│   │   │   ├── useHrPersistence.ts    # HR sample restore/flush to localStorage (reload recovery)
│   │   │   ├── usePreviousData.ts     # Cached previous weights/reps
│   │   │   ├── useStartSession.ts     # Session initialization
│   │   │   ├── useExerciseNavigation.ts # Focused view navigation + supersets
│   │   │   ├── useAdHocExercises.ts   # Ad-hoc exercise state + set lookups
│   │   │   ├── useDiscardSession.ts   # Discard incomplete session (shared with dashboard)
│   │   │   ├── useExerciseOrdering.ts # Single source of truth for order
│   │   │   ├── useRpeFlow.ts          # RPE prompt orchestration
│   │   │   └── useWorkoutForegroundService.ts # Android: mounted at app root; foreground service while a server session is active + strap connected
│   │   ├── lib/
│   │   │   ├── sessionStorage.ts  # Session-scoped localStorage keys + cleanup sweep
│   │   │   └── virtualExercise.ts # Synthetic Exercise builder for ad-hoc/swap inserts
│   │   ├── logic/
│   │   │   ├── whatIsNext.ts      # "What's Next?" calculation (CLIENT-SIDE)
│   │   │   ├── plates.ts          # Plate calculator math
│   │   │   ├── personalRecord.ts  # PR (1RM) rules for celebrations (mirrors Progress `personalRecords()`)
│   │   │   ├── progression.ts     # Deterministic double-progression hint (+ tests)
│   │   │   ├── suggestReps.ts     # Per-set rep prefill rules + parseRepTarget (+ tests)
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
│   │   │   ├── ExerciseProgressTab.tsx   # Mode toggle, search, landing (overview / cardio chips), detail routing
│   │   │   ├── LiftOverview.tsx          # "Your lifts": status chip, last set, sparkline per lift
│   │   │   ├── Sparkline.tsx             # Inline-SVG trend line (no recharts)
│   │   │   ├── StrengthDetail.tsx        # Strength chart + range + session list
│   │   │   ├── CardioDetail.tsx          # Cardio chart + range + session list
│   │   │   ├── detailParts.tsx           # DetailHeader, SegmentedControl, RangeSelector, useChartRange
│   │   │   ├── VolumeTrendsTab.tsx       # Total volume trends with metric toggle
│   │   │   ├── PersonalRecordsTab.tsx    # All-time PRs
│   │   │   └── ProgressChart.tsx         # Recharts line on a numeric time axis (shared by both detail views)
│   │   ├── hooks/
│   │   │   └── useProgressData.ts        # Thin useMemo wrapper over the logic/ modules
│   │   ├── logic/
│   │   │   ├── exerciseIndex.ts          # Picker names, per-mode most-trained, strength/cardio history, 1RM PRs — grouped by catalog identity (+ tests)
│   │   │   ├── exerciseSearch.ts         # Local picker search over chartable names + catalog aliases (+ tests)
│   │   │   ├── liftOverview.ts           # Overview rows: status, last top set, sparkline, order, summary (+ tests)
│   │   │   ├── chartRange.ts             # 3M/6M/1Y/All filter + default, time-axis ticks/labels (+ tests)
│   │   │   └── volumePeriods.ts          # Sunday weeks, 12-week bars, week/month-to-date comparisons; takes `now` (+ tests)
│   │   └── index.tsx              # Tabbed progress page entry
│   │
│   ├── dashboard/                 # Home/landing page
│   │   ├── components/
│   │   │   ├── NextWorkout.tsx    # "Up next" hero (rotation meta, expandable exercise list)
│   │   │   ├── Calendar.tsx       # Month view — workout days as filled tappable discs
│   │   │   ├── ResumeWorkout.tsx  # In-progress session card (amber tint)
│   │   │   ├── AdHocWorkoutPicker.tsx  # Quick workout modal
│   │   │   └── ThisWeek.tsx       # Sun–Sat training strip + streak chip + summary counts
│   │   ├── hooks/
│   │   │   └── useNextWorkoutLocal.ts  # Client-side next workout calc
│   │   └── index.tsx              # Home page entry
│   │
│   ├── settings/                  # Settings page
│   │   ├── components/
│   │   │   ├── ExerciseCatalogCard.tsx # Catalog list: merge into… / split off alias
│   │   │   ├── ServerCard.tsx     # API base URL (Android app)
│   │   │   └── AndroidCard.tsx    # Native permissions + diagnostics
│   │   └── index.tsx              # Profile (DOB/sex/HR for zones), auto-progression, AI coach card
│   │
│   └── coach/                     # AI Coach (opt-in, BYO API key)
│       ├── components/
│       │   ├── AiCoachSettingsCard.tsx  # Settings card: provider/model/key config
│       │   └── CoachMarkdown.tsx        # Markdown renderer for assistant bubbles
│       ├── hooks/
│       │   └── useCoachDossier.ts     # Assembles the preloaded dossier (memoized all-time block)
│       ├── lib/
│       │   ├── dossier.ts             # Pure dossier builders — the coach's whole view (+ tests)
│       │   ├── providers/
│       │   │   ├── types.ts           # Provider interface
│       │   │   ├── presets.ts         # Known providers (Anthropic, OpenAI, etc.)
│       │   │   ├── anthropic.ts       # Anthropic SDK adapter
│       │   │   ├── openaiCompatible.ts # OpenAI-compatible fetch adapter
│       │   │   └── index.ts           # createProvider factory
│       │   ├── coachLoop.ts           # Neutral agentic loop (tool calls)
│       │   ├── tools.ts               # get_workout_history + propose_program (read-only)
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
│   │   ├── cardio.ts              # Cardio modality labels + exerciseTargetSummary
│   │   ├── baseUrl.ts             # API base URL normalisation (relative on web, configured server URL in the app)
│   │   └── download.ts            # openServerDownload — attachments open in the system browser inside the app
│   ├── lib/
│   │   ├── hrZones.ts             # HR zone math: Karvonen/Gulati, zones, time-in-zone (+ tests)
│   │   ├── effectiveWeight.ts     # Assisted (negative) weight → effective load via bodyweight (+ tests)
│   │   ├── catalog.ts             # catalogNames / groupName / catalogFingerprint (catalog identity for readers)
│   │   ├── liftTrend.ts           # Stall run + lift status (coach + Progress share it), localToday (+ tests)
│   │   ├── oneRepMax.ts           # Epley 1RM estimate
│   │   ├── platform.ts            # isNativeApp() — the one runtime gate for Android-only code
│   │   ├── shell.ts               # window.WorkoutShell (Android shell): server the UI loads from, hand-off, openExternal (+ tests)
│   │   ├── foregroundService.ts   # Desired-state loop over the Android foreground-service plugin (+ tests)
│   │   ├── restNotification.ts    # Exact local notification for the rest timer (Android)
│   │   └── hrTransport/           # HR strap transport: types, webBluetooth (browser), nativeBle (app), parseHr
│   ├── utils/
│   │   ├── format.ts              # formatMMSS, parseDurationToSec, etc. (+ tests)
│   │   └── heartRate.ts           # downsampleHr — bucket HR samples for storage/charts
│   └── context/
│       ├── TimerContext.tsx       # Global rest timer (survives navigation)
│       ├── OfflineContext.tsx     # Online/offline status
│       ├── ThemeContext.tsx       # Dark mode state
│       ├── HeartRateContext.tsx   # HR strap connection (via hrTransport) + live samples
│       ├── UserProfileContext.tsx # DOB/sex/resting+max HR profile (for zones)
│       ├── ProgressionContext.tsx # Auto-progression settings (enabled, increment)
│       └── AiCoachContext.tsx     # AI Coach settings + enabled state
│
├── App.tsx                        # Router setup + context providers
└── main.tsx                       # Entry point
```

**Principle**: When debugging the session logger, everything is in `features/active-session/`. No hunting.

---

## Backend Architecture

The backend validates, persists, keeps exercise identity straight, and answers indexed lookups. It makes no product decisions.

```
backend/
├── src/
│   ├── routes/
│   │   ├── programs.ts      # CRUD for programs
│   │   ├── workouts.ts      # CRUD for workouts
│   │   ├── exercises.ts     # CRUD for exercises
│   │   ├── sessions.ts      # CRUD for sessions + sets
│   │   └── catalog.ts       # Exercise catalog: list (with counts), merge, split
│   ├── db/
│   │   ├── schema.ts        # Drizzle tables + relations (mirrors the live DDL exactly) + row types
│   │   ├── columns.ts       # sequelizeDate custom column (Sequelize text date format, read + write)
│   │   ├── index.ts         # better-sqlite3 connection (DB_PATH, foreign_keys ON) + `db`
│   │   ├── migrate.ts       # bootstrap(): legacy column adds → drizzle migrator → catalog backfill
│   │   ├── catalog.ts       # resolveCatalogId / findCatalogId / backfillCatalog (every boot)
│   │   └── queries/
│   │       └── setsByName.ts # Name → catalog → sets by catalogId (previous hints, PR check); name fallback
│   ├── middleware/
│   │   └── validate.ts      # Zod schema validation (body + URL params)
│   └── index.ts             # Express app setup
├── drizzle/                 # drizzle-kit SQL migrations + meta/ (committed; copied into the image)
├── drizzle.config.ts
├── test/                    # Vitest + supertest API tests over in-memory SQLite (`npm test`): per-router tests,
│                            #   parity.test.ts (HTTP characterization), migrations/catalog tests replaying the live DDL
├── database.sqlite          # Throwaway local-dev DB (gitignored) — the real DBs are the docker volumes
├── package.json
└── tsconfig.json
```

### What the Backend Does NOT Do
- ❌ Calculate "What's Next?", progression hints, rep suggestions, PR rules (frontend logic, tested there)
- ❌ Sort or filter for display (History, Progress, the coach dossier are built client-side)
- ❌ Guess at data: the catalog backfill groups only by `lower(trim(name))`; merging near-duplicates is the user's call

### What the Backend DOES
- ✅ Validate request bodies and URL params with Zod; `validate()` writes the parsed result back so defaults/stripping apply
- ✅ Persist via Drizzle with `foreign_keys = ON` (SQLite does the cascades)
- ✅ Resolve `catalogId` from `exerciseName` on every write; backfill NULLs on every boot
- ✅ Indexed lookups by name/catalog (`/previous`, `history-by-name`, `all-sets-by-name`) instead of the client downloading everything
- ✅ The few derived bits that predate v3 and stay: week streak in `/stats`, rotation advance in `/complete`, CSV export

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
| POST | /api/sessions/:id/sets | Log a set (server derives `catalogId` from `exerciseName`; responses for sets/exercises carry `catalogId`) |
| PUT | /api/sessions/:id/sets/:setId | Update a set (weight, reps, RPE, duration, distance; re-point via exerciseName + exerciseId:null for swap carry-over) |
| DELETE | /api/sessions/:id/sets/:setId | Delete a set |
| PUT | /api/sessions/:id/exercise-note | Set/clear a per-exercise note |
| POST | /api/sessions/:id/complete | Complete session (accepts session HR summary) |
| DELETE | /api/sessions/:id | Delete session (cascades to sets) |
| GET | /api/catalog | Exercise catalog: `{id, name, aliases, setCount, exerciseCount, createdAt, updatedAt}[]`, sorted by name |
| POST | /api/catalog/:id/merge | Fold `{ fromId }` into `:id` (400 self, 404 missing, 409 alias clash) |
| POST | /api/catalog/:id/split | Split `{ alias }` off `:id` into its own entry again (exact inverse of merge) |

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
- Exercise Progress, Strength mode opens to **Your lifts** (`LiftOverview.tsx`, data from
  `logic/liftOverview.ts`): one row per active-program strength lift (else the 8 most trained),
  catalog-grouped — status chip, last top set (raw signed weight), inline-SVG best-1RM sparkline over
  the last 8 dates with % change, and a summary line. Status is `liftStatus()` in
  `shared/lib/liftTrend.ts`, the same rule as the coach's stall/dropped flags (first match: none /
  inactive 42+ days / new < 3 dates / stalled 3+ / lighter / progressing / holding); fed the PR
  filters. Order: stalled, lighter, holding, progressing, new, inactive, none; program order within.
  Progressing = `primary-*`, stalled = `accent-*`, never red. Tap a row (or search) for the detail
  view. Cardio mode keeps chips: active-program cardio + "Most Trained" (ranked by cardio sets).
  Search is local (`logic/exerciseSearch.ts`): only names Progress can chart for the mode, catalog
  aliases match and resolve to the catalog name
- Detail views (`StrengthDetail.tsx`, `CardioDetail.tsx`): metric toggle (Volume / 1RM / Weight, or
  Pace / Distance / Duration / HR) and a 3M / 6M / 1Y / All range (`logic/chartRange.ts`; default
  6M, All when 6M has < 2 sessions) that the Session History list follows. `ProgressChart` uses a
  numeric time axis — gaps look like gaps; M/D ticks, /YY when the span crosses a year. Strength
  bests use the PR filters (working sets, effective weight > 0, reps > 0)
- Volume Trends: weeks start Sunday (like the dashboard and the server streak). Cards compare
  period-to-date with the previous period at the same point (week through the same weekday, month
  through the same day, clamped); the 12-week bars are whole weeks
- Personal Records: one definition — best estimated 1RM (Epley, a single is its own 1RM), same
  filters as the in-session PR toast (working sets, effective weight > 0, reps > 0). The card, its
  date, RECENT and the "Recent" sort all come from the set behind that 1RM
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

### 17. Coach Dossier (preloaded context)
- The coach's data is **pushed into the system prompt**, not pulled through tools. Measured on
  live data: the whole 88-session history is 6,692 tokens, a tiered dossier is ~3,100, and tool
  definitions alone cost ~1,000 tokens on *every* request while each round trip re-sends the
  conversation. The data is smaller than the machinery built to query it.
- `lib/dossier.ts` builds it (pure, tested): today's date, an athlete line (age/sex/resting HR +
  auto-progression settings), stats, the active program, all-time per-exercise rollups with
  stall/dropped flags, **every exercise note ever written**, and the last 20 sessions in full
  per-set detail. Never emits `heartRateSeries`, ids or timestamps.
- **Stability is load-bearing**: the text sits behind a prompt-cache breakpoint, so it must be
  byte-identical across turns. All builders are pure and take `today` explicitly, and the page
  pins the assembled string in a ref on first send (cleared by New Chat) so a background
  refetch cannot change it mid-conversation.
- **Never sent without it**: the page disables input + starters until the dossier is assembled
  (all blocks real; a brand-new instance gets the empty all-time/notes blocks directly), and
  shows Retry if a fetch failed. The all-time memo key carries a format version
  (`ALLTIME_FORMAT_VERSION` in `useCoachDossier.ts`) — bump it when the all-time/notes text changes.
- **Stall flag** = sessions since the lift last progressed at its current top weight: over the
  trailing run at that weight, a session progresses if its best single-set reps or total reps
  at the weight beat every earlier one in the run. Flagged at 3+. Holding weight while reps
  climb (double progression) is not a stall. A dropped lift (42+ days) is never also flagged
  stalled. The rule lives in `shared/lib/liftTrend.ts`, shared with the Progress overview.
- Thread (`lib/thread.ts`): failed sends are stored with `error: true` (legacy `⚠️` replies
  count too) and, with the user turn behind them, are never sent to the model; the 12-message
  window always starts on a user turn. A reply that hits the output cap (Anthropic 4,096) is
  marked cut off and its tool calls are not run.
- Toolset is 2: `get_workout_history` (the tail past the 20-session window; prefer `monthsBack`)
  and `propose_program`. The coach remains strictly read-only — no POST/PUT/DELETE anywhere.
  The import preview lists every workout and exercise (sets × reps) before Import.

---

### 18. Exercise Catalog (v3 Bundle 2)
- `ExerciseCatalog` gives every lift a stable id; `catalogId` on program exercises and sets, names still stored everywhere
- Server resolves the id from the name on every write; boot-time backfill heals rows an old client wrote without one
- Settings → Exercise catalog (collapsed; **Manage** expands): merge B into A (B becomes an alias, all rows re-pointed), split an alias back off
- Progress, PR check, previous hints and the coach all-time block group by catalog identity, so a rename is one lift

### 19. Assisted Lifts
- Negative weight = assistance (`−40` is 40 lb of help); `lbs`/`assist` toggle in SetInput; backend floor −500
- Volume, 1RM, PRs and the coach use `effectiveWeight()` = profile bodyweight + weight (set skipped without a bodyweight)

### 20. Android App
- Capacitor WebView around the same React build; native BLE for the strap, exact local notification for the timer, foreground service while a session is active
- Built in Docker (`scripts/build-apk.sh`), published as a GitHub Release (`scripts/release-apk.sh`)
- **B3: the UI loads from the phone's server** (`docs/v3-bundle-b3-server-ui.md`). The shell (`MainActivity.java`) starts Capacitor with the saved server as `server.url` — the only way the plugin bridge reaches a remote page — and exposes `window.WorkoutShell` (`ShellInterface.java`, feature-checked via `shared/lib/shell.ts`). `ship.sh <inst>` updates that phone's UI; APK releases are for native changes only. **A server must run a B3-aware build before its phone installs a B3 APK.** Bundled `public/offline.html` covers an unreachable server

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

One checkout, one `docker-compose.yml`, **three instances as compose profiles**. All three run the
same two images (backend + frontend), tagged by git commit (`TAG`, set by `scripts/ship.sh`).

| Instance | Profile | Frontend container (host port) | Backend container | Data volume |
|----------|---------|--------------------------------|-------------------|-------------|
| Jason | `main` | `workout-tracker-frontend` (**8035**) | `workout-tracker-backend` | `workout-tracker-data` |
| Wife | `wife` | `workout-tracker-wife-frontend` (**8036**) | `workout-tracker-wife-backend` | `workout-tracker-wife-data` |
| Staging | `staging` | `workout-tracker-staging-frontend` (**8037**) | `workout-tracker-staging-backend` | `workout-tracker-staging-data` |

Each pair sits on its own private network with the backend aliased `backend` (nginx proxies
`/api/*` to `http://backend:3001`). Backends read `DB_PATH=/data/database.sqlite` from their named
volume. **The volumes are the real databases** — not anything in the repo — and are declared
`external` so compose can never create or remove them. Staging is a throwaway copy of main's data.

**Deploy loop** (every change, in this order — the wife stack lags main by days, never leads):

```bash
scripts/ship.sh staging && scripts/seed-staging.sh   # tests → build → up; then copy main's data in
scripts/ship.sh main                                 # canary: you
scripts/ship.sh wife                                 # same commit, a few days later
```

`ship.sh` runs `tsc --noEmit` + both vitest suites, **refuses if `/api/sessions/active` is
non-null** on that instance (`--force` overrides), backs up that instance, then
`TAG=<short sha> docker compose --profile X up -d --build --wait`. A clean tag whose images already
exist is reused (build once, run three times); a dirty tree tags `<sha>-dirty` and always rebuilds.
Deploys are logged to `~/backups/workout-tracker/deploys.log`.

| Script | Purpose |
|--------|---------|
| `scripts/backup.sh <inst>` | Consistent snapshot (`VACUUM INTO` inside the container via the image's own SQLite driver — better-sqlite3, or sqlite3 on pre-Drizzle images; no CLI in the image) → `~/backups/workout-tracker/<inst>-<stamp>.sqlite`, integrity-checked twice |
| `scripts/api-snapshot.sh <inst> <dir>` | Sorted-key JSON dump of the read endpoints for `diff -r` before/after a backend refactor |
| `scripts/backup-cron.sh` | Nightly (crontab `30 3 * * *`): main + wife, 60-day local retention, rsync mirror to `/mnt/faster/backups/workout-tracker-db/` (NAS, 365 days), log in `backup.log` |
| `scripts/restore.sh <inst> <file>` | Replace an instance's DB (pre-restore backup, typed confirmation, `--yes`/`--force`) |
| `scripts/seed-staging.sh` | backup main → restore into staging |
| `scripts/rollback.sh <inst> <tag>` | Redeploy an existing image tag, never builds; `--restore <file>` optional |
| `scripts/prune-images.sh [keep]` | Drop old image tags beyond the newest N (default 5) |
| `scripts/release-apk.sh` | Build the APK from HEAD (clean + pushed) and publish GitHub Release `apk-<sha>`; phones install from `releases/latest/download/workout-tracker.apk` |

Manual equivalent for a quick rebuild of one instance (images tagged `latest`):
`docker compose --profile main up -d --build`. **With no `--profile`, `docker compose up` starts
nothing** — deliberate. Never run `docker compose down -v`.

To inspect live data:
```bash
# Hit the API through the instance's port
curl -s http://127.0.0.1:8035/api/programs

# Or take a consistent copy for ad-hoc sqlite queries (never query the volume file directly)
scripts/backup.sh main        # prints the path; open it with python3's sqlite3 module
```

CI: `.github/workflows/test.yml` runs both suites + typecheck on every push (second opinion; `ship.sh` is the gate).

### Local dev (npm) — for code changes

Run the frontend and backend directly when iterating on code. This uses a **separate, throwaway** SQLite file at `backend/database.sqlite` (gitignored) — it has nothing to do with the docker volume.

| Layer | Port | Command |
|-------|------|---------|
| Backend | 3002 | `cd backend && npm run dev` |
| Frontend | 5174 | `cd frontend && npm run dev` |

If you need real data in dev, copy it out of the container first (`docker cp ...` above).

### Android app

The native Android app wraps the existing React build in a Capacitor WebView (`frontend/android/`, `Dockerfile.android`). It is built in Docker without requiring Android SDK installed on the host: `scripts/build-apk.sh` compiles the frontend, syncs native assets, runs `./gradlew assembleDebug` in a container with a persisted keystore volume (`workout-tracker-android-home`), and outputs `~/apk/latest.apk`. `scripts/serve-apk.sh` serves the APK over the local network / VPN on port 8038 for sideloading onto test devices. `scripts/release-apk.sh` publishes it as a GitHub Release instead (stable link: `https://github.com/RepoBean/workout-tracker/releases/latest/download/workout-tracker.apk`) — built locally so the keystore volume signs every release and updates install over the old app. Since B3 the APK is a shell that loads the UI from the phone's server (`https://gym.bootyhole23.com` = main, `https://gym-e.bootyhole23.com` = wife), so UI and backend changes both reach the app via `ship.sh`; release a new APK only for native changes. Both Jason and his wife run it.

---

## Changelog

Lives in `CHANGELOG.md` (one row per shipped change). Add a row for every change you ship; v3 bundles
also get a plan + results doc in `docs/v3-bundle-*.md`. The v3 checklist and decision record is
`docs/v3-plan.md`.

---

## Style Guide

- **Tailwind**: Mobile-first, use `sm:` breakpoints for larger screens
- **Colors**: Teal primary via the `primary-*` scale (`primary-600` = #0d9488); amber `accent-*`; dark surfaces use `surface-*` tokens (never `dark:*-gray-*`)
- **Components**: Small and focused, <500 lines per file
- **Types**: Strict TypeScript, no `any` unless absolutely necessary
- **Naming**: Feature folders are `kebab-case`, components are `PascalCase`
