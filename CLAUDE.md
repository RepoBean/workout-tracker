# Workout Tracker V2 — Personal Edition

## What This Is

A ground-up rebuild of a self-hosted workout tracking app. V1 exists at `~/projects/workout_app/` and works fine — this is V2 with better architecture, better UX, and TypeScript.

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
| Database | SQLite (shared with V1, symlinked) |
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

V2 has its own independent database at `backend/database.sqlite`. Not linked to V1 in any way.

**Option A: Fresh Start** — Let Sequelize create empty tables on first run.
**Option B: Copy Data** — One-time copy from V1: `cp ~/projects/workout_app/backend/database.sqlite ./backend/database.sqlite`

Either way, V2 owns its database completely.

## Database Schema

**Do not change the schema** unless absolutely necessary (and document why).

### Tables & Relationships

```
Program (id, name, isActive, isArchived, currentWorkoutIndex, createdAt, updatedAt)
└─> Workout (id, programId, name, orderIndex, createdAt, updatedAt)
    └─> Exercise (id, workoutId, name, targetSets, targetReps, orderIndex, supersetGroup, createdAt, updatedAt)

Session (id, programId, workoutId, programName, workoutName, completedAt, isAdHoc, createdAt, updatedAt)
└─> Set (id, sessionId, exerciseId, exerciseName, weight, reps, setNumber, perceivedEffort, createdAt, updatedAt)
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

### Potential Schema Addition (V2)

For drop set support, may need:
```sql
ALTER TABLE Sets ADD COLUMN dropIndex INTEGER DEFAULT 0;
```
Standard sets have `dropIndex = 0`, drop sets have `1, 2, 3...`

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
│   │   │   ├── RestTimer.tsx      # Timer display + controls
│   │   │   ├── PlateCalculator.tsx
│   │   │   └── DropSetInput.tsx
│   │   ├── hooks/
│   │   │   ├── useSession.ts      # Session state + optimistic updates
│   │   │   ├── useTimer.ts        # Timer with notifications
│   │   │   └── usePreviousData.ts # Cached previous weights/reps
│   │   ├── logic/
│   │   │   ├── whatIsNext.ts      # "What's Next?" calculation (CLIENT-SIDE)
│   │   │   └── plates.ts          # Plate calculator math
│   │   └── index.tsx              # WorkoutSession page entry
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
│   ├── history/                   # Past sessions, analytics
│   │   ├── components/
│   │   │   ├── SessionCard.tsx
│   │   │   └── ProgressChart.tsx
│   │   ├── hooks/
│   │   │   └── useHistory.ts
│   │   └── index.tsx              # History page entry
│   │
│   └── dashboard/                 # Home/landing page
│       ├── components/
│       │   ├── NextWorkout.tsx    # "What's Next?" display
│       │   └── Calendar.tsx       # Month view with workout dots
│       └── index.tsx              # Home page entry
│
├── shared/
│   ├── ui/                        # Generic, reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   └── Toast.tsx
│   ├── api/
│   │   ├── client.ts              # Axios instance, error handling
│   │   ├── types.ts               # Shared API request/response types
│   │   └── queries.ts             # TanStack Query definitions
│   └── context/
│       ├── TimerContext.tsx       # Global rest timer (survives navigation)
│       ├── OfflineContext.tsx     # Online/offline status
│       └── ThemeContext.tsx       # Dark mode state
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
├── database.sqlite              # Symlink to V1's database
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

## Key Features to Build

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
- Respect system preference by default
- Manual toggle to override
- Persist preference in localStorage

### 6. PWA
- Manifest for "Add to Home Screen"
- Service worker caches app shell
- Works offline for viewing cached data
- Clear indicator when offline

---

## Development Setup

### Ports (Avoid V1 Conflict)
- V2 Frontend: **5174**
- V2 Backend: **3002**
- (V1 stays on 5173/3001)

### Database Setup
```bash
# Option A: Fresh start (empty database, Sequelize creates tables)
# Just start the backend - it will create database.sqlite automatically

# Option B: Copy existing data (one-time, then independent)
cp ~/projects/workout_app/backend/database.sqlite ./backend/database.sqlite
```

V2's database is completely independent from V1.

### Running Both Versions
```bash
# Terminal 1: V1 (production use)
cd ~/projects/workout_app && npm run dev

# Terminal 2: V2 backend
cd ~/projects/workout_app_v2/backend && npm run dev

# Terminal 3: V2 frontend
cd ~/projects/workout_app_v2/frontend && npm run dev
```

---

## Development Phases

### Phase 1: Foundation
- [ ] Vite + React + TypeScript + Tailwind frontend
- [ ] Express + TypeScript backend
- [ ] Feature-based folder structure (empty folders OK)
- [ ] Shared types for database models
- [ ] Connect to existing SQLite database
- [ ] PWA manifest skeleton
- [ ] ThemeContext + dark mode
- [ ] Basic routing to 4 feature entry points

### Phase 2: Active Session (The Core)
- [ ] `features/active-session/` components
- [ ] SetInput with optimistic UI
- [ ] ExerciseCard with previous weight display
- [ ] Client-side "What's Next?" logic
- [ ] Basic set logging flow

### Phase 3: Timer & Notifications
- [ ] Global TimerContext
- [ ] RestTimer component
- [ ] Web Notifications API integration
- [ ] Background tab drift correction

### Phase 4: New Features
- [ ] Plate calculator
- [ ] Drop set support
- [ ] Swipe gestures

### Phase 5: Remaining Features
- [ ] Program builder CRUD
- [ ] History view
- [ ] Dashboard with calendar
- [ ] Full PWA offline support

### Phase 6: Polish & Cutover
- [ ] Feature parity with V1
- [ ] Performance audit
- [ ] Switch to V2 for daily use

---

## V1 Reference (For Inspiration Only)

V1 lives at `~/projects/workout_app/`. V2 is completely independent — no shared code, no shared database. Reference V1 only if you need to understand how a feature worked:

- `backend/database.js` — Sequelize models and associations
- `backend/routes/sessions.js` — Session/set logging logic
- `frontend/src/pages/WorkoutSession.jsx` — Current workout UI (to be decomposed in V2)

---

## Style Guide

- **Tailwind**: Mobile-first, use `sm:` breakpoints for larger screens
- **Colors**: Indigo primary (`indigo-600`), follow V1's palette
- **Components**: Small and focused, <500 lines per file
- **Types**: Strict TypeScript, no `any` unless absolutely necessary
- **Naming**: Feature folders are `kebab-case`, components are `PascalCase`