import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db, now } from '../db/index.js';
import { exercises, programs, sessions, sets, workouts } from '../db/schema.js';
import type { Exercise } from '../db/schema.js';
import { latestSetsByName } from '../db/queries/setsByName.js';
import { resolveCatalogId } from '../db/catalog.js';
import { validate, validateParams, idParamSchema, sessionSetParamsSchema, paginationQuerySchema } from '../middleware/validate.js';

const router = Router();

const isCardioSet = (s: { durationSec?: number | null; distance?: number | null }): boolean =>
  (s.durationSec ?? 0) > 0 || (s.distance ?? 0) > 0;

// ============================================
// Zod Schemas
// ============================================

// A session's completedAt may be set from the client (logging a past workout,
// moving a session's date). Never in the future; a minute of clock skew is fine.
const pastDateSchema = z.string().datetime({ offset: true })
  .refine(v => Date.parse(v) <= Date.now() + 60_000, 'Date cannot be in the future');

const startSessionSchema = z.object({
  workoutId: z.number().int().positive().optional(),
  isAdHoc: z.boolean().optional().default(false),
  // Present = log a past workout: the session is created already completed.
  completedAt: pastDateSchema.optional(),
  durationMin: z.number().int().min(1).max(600).optional(),
});

const updateSessionSchema = z.object({
  completedAt: pastDateSchema.optional(),
});

// Floor for set weight. Negative weights log assisted lifts (assisted pull-up
// at -40 = 40 lbs of help); analytics convert via bodyweight on the client.
const MIN_WEIGHT = -500;

const logSetSchema = z.object({
  exerciseId: z.number().int().nullable().optional(), // negative IDs allowed for ad-hoc
  exerciseName: z.string().min(1).max(255),
  weight: z.number().min(MIN_WEIGHT), // negative = assisted (e.g. -40 = 40 lbs of assistance)
  reps: z.number().int().min(0),
  setNumber: z.number().int().min(1),
  perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
  dropIndex: z.number().int().min(0).optional().default(0),
  heartRateAvg: z.number().int().min(20).max(250).nullable().optional(),
  heartRateMax: z.number().int().min(20).max(250).nullable().optional(),
  durationSec: z.number().int().min(1).nullable().optional(),
  distance: z.number().min(0).nullable().optional(),
}).superRefine((data, ctx) => {
  if (!isCardioSet(data) && data.reps < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reps'],
      message: 'Strength sets require reps >= 1',
    });
  }
});

// Update set schema. exerciseName/exerciseId support re-pointing a set at a
// different exercise (swap carry-over); only null is accepted for exerciseId —
// re-pointed sets become name-keyed ad-hoc, never attached to another program
// exercise's positive id.
const updateSetSchema = z.object({
  weight: z.number().min(MIN_WEIGHT).optional(),
  reps: z.number().int().min(0).optional(),
  perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
  heartRateAvg: z.number().int().min(20).max(250).nullable().optional(),
  heartRateMax: z.number().int().min(20).max(250).nullable().optional(),
  durationSec: z.number().int().min(1).nullable().optional(),
  distance: z.number().min(0).nullable().optional(),
  exerciseName: z.string().min(1).max(255).optional(),
  exerciseId: z.null().optional(),
});

const setExerciseNoteSchema = z.object({
  exerciseName: z.string().min(1).max(255),
  note: z.string().max(500).nullable(),
});

const completeSessionSchema = z.object({
  heartRateAvg: z.number().int().min(20).max(250).nullable().optional(),
  heartRateMin: z.number().int().min(20).max(250).nullable().optional(),
  heartRateMax: z.number().int().min(20).max(250).nullable().optional(),
  heartRateSeries: z.object({
    t: z.array(z.number().int().min(0).max(14400)).max(2000),
    b: z.array(z.number().int().min(20).max(250)).max(2000),
  }).refine(s => s.t.length === s.b.length, 'series length mismatch')
    .nullable().optional(),
});

// ============================================
// Helpers
// ============================================

// Sets in id order = insertion order = the order actually performed
// (frontend history groups by first-seen exerciseName)
const withSets = { sets: { orderBy: asc(sets.id) } } as const;

function findSessionWithSets(id: number) {
  return db.query.sessions.findFirst({ where: eq(sessions.id, id), with: withSets });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Every set write bumps its session's updatedAt, so readers keyed on it
// (coach all-time memo via /stats.lastUpdatedAt) see edits to old sessions.
function touchSession(tx: Tx, sessionId: number, ts: Date) {
  tx.update(sessions).set({ updatedAt: ts }).where(eq(sessions.id, sessionId)).run();
}

function findSession(id: number) {
  return db.select().from(sessions).where(eq(sessions.id, id)).get();
}

function findSet(id: number) {
  return db.select().from(sets).where(eq(sets.id, id)).get();
}

function workoutExercises(workoutId: number | null): Exercise[] {
  if (!workoutId) return [];
  return db.select().from(exercises)
    .where(eq(exercises.workoutId, workoutId))
    .orderBy(asc(exercises.orderIndex))
    .all();
}

/**
 * Parse a date-bound query param. Callers send full ISO strings (calendar) or
 * bare YYYY-MM-DD / YYYY-MM-DDT23:59:59.999Z (coach); a bare date means UTC
 * midnight, so `to=YYYY-MM-DD` excludes that day — matching prior behaviour.
 * Returns undefined when absent, null when unparseable.
 */
function parseDateBound(value: unknown): Date | null | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ============================================
// Routes
// ============================================

// GET /api/sessions/history - Get session history with pagination and optional date range
router.get('/history', async (req: Request, res: Response) => {
  try {
    // Soft validation — invalid params fall back to defaults rather than returning 400.
    // The schema clamps out-of-range numeric limits toward the request (up to 2000),
    // so a large limit is honored, not silently shrunk to the default.
    const limitParam = paginationQuerySchema.shape.limit.safeParse(req.query.limit);
    const offsetParam = paginationQuerySchema.shape.offset.safeParse(req.query.offset);
    const limit = limitParam.success ? (limitParam.data ?? 50) : 50;
    const offset = offsetParam.success ? (offsetParam.data ?? 0) : 0;

    const from = parseDateBound(req.query.from);
    const to = parseDateBound(req.query.to);
    const invalid = [from === null && 'from', to === null && 'to'].filter(Boolean) as string[];
    if (invalid.length > 0) {
      res.status(400).json({
        error: 'Validation failed',
        details: invalid.map(path => ({ path, message: 'Invalid date' })),
      });
      return;
    }

    const rows = await db.query.sessions.findMany({
      where: and(
        isNotNull(sessions.completedAt),
        from ? gte(sessions.completedAt, from) : undefined,
        to ? lte(sessions.completedAt, to) : undefined,
      ),
      with: withSets,
      orderBy: desc(sessions.completedAt),
      limit,
      offset,
    });

    res.json(rows);
  } catch (error) {
    console.error('Error fetching session history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/sessions/active - Find incomplete session for resume
router.get('/active', async (req: Request, res: Response) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const session = await db.query.sessions.findFirst({
      where: and(isNull(sessions.completedAt), gte(sessions.createdAt, twentyFourHoursAgo)),
      with: withSets,
      orderBy: desc(sessions.createdAt),
    });

    if (!session) {
      res.json(null);
      return;
    }

    res.json({
      ...session,
      exercises: workoutExercises(session.workoutId),
    });
  } catch (error) {
    console.error('Error fetching active session:', error);
    res.status(500).json({ error: 'Failed to fetch active session' });
  }
});

// GET /api/sessions/export-csv - Export all session history as CSV
router.get('/export-csv', async (req: Request, res: Response) => {
  try {
    const rows = await db.query.sessions.findMany({
      where: isNotNull(sessions.completedAt),
      with: withSets,
      orderBy: desc(sessions.completedAt),
    });

    // CSV field escaping to prevent formula injection
    const escapeCSV = (value: string | number | null | undefined): string => {
      if (value === null || value === undefined) return '';
      // Numbers are never a formula-injection vector; without this an assisted
      // weight (-40) would export as the text cell "'-40".
      if (typeof value === 'number') return String(value);
      const str = String(value);
      if (/^[=+\-@\t\r]/.test(str)) {
        return `"'${str.replace(/"/g, '""')}"`;
      }
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const header = 'Date,Program,Workout,Exercise,Set#,Weight(lbs),Reps,RPE,DropIndex,Duration(sec),Distance(mi),HR_Avg,HR_Max';
    const lines: string[] = [];

    for (const session of rows) {
      // Local calendar day (container TZ), so an evening session isn't dated tomorrow.
      const date = session.completedAt ? localDateKey(session.completedAt) : '';

      for (const set of session.sets) {
        const isCardio = isCardioSet(set);
        lines.push([
          escapeCSV(date),
          escapeCSV(session.programName),
          escapeCSV(session.workoutName),
          escapeCSV(set.exerciseName),
          escapeCSV(set.setNumber),
          escapeCSV(isCardio ? '' : set.weight),
          escapeCSV(isCardio ? '' : set.reps),
          escapeCSV(set.perceivedEffort),
          escapeCSV(set.dropIndex),
          escapeCSV(set.durationSec),
          escapeCSV(set.distance),
          escapeCSV(set.heartRateAvg),
          escapeCSV(set.heartRateMax),
        ].join(','));
      }
    }

    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=workout-history.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// GET /api/sessions/stats - Summary statistics
router.get('/stats', (req: Request, res: Response) => {
  try {
    // Fetch all completed session dates and compute everything in JS
    // This avoids the SQLite strftime week-boundary bug
    const rows = db.select({ completedAt: sessions.completedAt, updatedAt: sessions.updatedAt })
      .from(sessions)
      .where(isNotNull(sessions.completedAt))
      .all();
    const completed = rows.map(s => s.completedAt as Date);
    // Newest edit anywhere in history (set edits bump their session's updatedAt).
    const lastUpdatedAt = rows.reduce<Date | null>(
      (max, r) => (!max || r.updatedAt > max ? r.updatedAt : max), null);

    const totalSessions = completed.length;

    // Sessions last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sessionsLast30Days = completed.filter((d) => d >= thirtyDaysAgo).length;

    // Week streak: consecutive calendar weeks (Sun-Sat) with >= 1 workout
    // Uses Sunday-based weeks to match JS getDay() where Sunday = 0
    const getSundayWeekKey = (date: Date): string => {
      const d = new Date(date);
      // Roll back to Sunday of this week
      d.setDate(d.getDate() - d.getDay());
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    };

    // Collect distinct weeks that have at least one session
    const activeWeeks = new globalThis.Set<string>();
    for (const d of completed) {
      activeWeeks.add(getSundayWeekKey(d));
    }

    // Walk backwards from the current week
    let weekStreak = 0;
    const cursor = new Date(now);

    // Check current week first
    let currentWeekKey = getSundayWeekKey(cursor);
    if (activeWeeks.has(currentWeekKey)) {
      weekStreak = 1;
    } else {
      // Current week has no workouts yet — check last week
      cursor.setDate(cursor.getDate() - 7);
      currentWeekKey = getSundayWeekKey(cursor);
      if (activeWeeks.has(currentWeekKey)) {
        weekStreak = 1;
      }
      // If last week also empty, streak is 0
    }

    // Continue backwards from the week before the one that started the streak
    if (weekStreak > 0) {
      cursor.setTime(now.getTime());
      // Move to the Sunday of the week that started our streak
      // If current week counted, start from current week's Sunday
      // If last week counted, start from last week's Sunday
      const startKey = getSundayWeekKey(cursor);
      if (!activeWeeks.has(startKey)) {
        cursor.setDate(cursor.getDate() - 7);
      }
      // Now walk backwards
      cursor.setDate(cursor.getDate() - 7);
      while (activeWeeks.has(getSundayWeekKey(cursor))) {
        weekStreak++;
        cursor.setDate(cursor.getDate() - 7);
      }
    }

    res.json({
      totalSessions,
      sessionsLast30Days,
      weekStreak,
      lastUpdatedAt,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/sessions/:id - Get session by ID (includes exercises from workout)
router.get('/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const session = await findSessionWithSets(Number(req.params.id));

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({
      ...session,
      exercises: workoutExercises(session.workoutId),
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// GET /api/sessions/:id/previous - Get previous session data for hints
// Looks up history by exercise NAME (not workoutId) so ad-hoc and cross-workout history is visible
router.get('/:id/previous', validateParams(idParamSchema), (req: Request, res: Response) => {
  try {
    const currentSession = findSession(Number(req.params.id));
    if (!currentSession) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Ad-hoc sessions without a workout have no pre-defined exercises to look up
    const exerciseData: Record<number, { sets: Array<{ setNumber: number; weight: number; reps: number }> }> = {};

    for (const exercise of workoutExercises(currentSession.workoutId)) {
      const latest = latestSetsByName(exercise.name, exercise.catalogId);
      if (latest) {
        exerciseData[exercise.id] = { sets: latest.sets };
      }
    }

    res.json({ exerciseData });
  } catch (error) {
    console.error('Error fetching previous session:', error);
    res.status(500).json({ error: 'Failed to fetch previous session data' });
  }
});

// POST /api/sessions/start - Start a new session
router.post('/start', validate(startSessionSchema), async (req: Request, res: Response) => {
  try {
    const { workoutId, isAdHoc, completedAt, durationMin } = req.body;
    const ts = now();
    // Logging a past workout: created already completed, always ad-hoc (never
    // in /active, never through /complete, never advances the rotation).
    const past = completedAt
      ? { completedAt: new Date(completedAt), createdAt: new Date(Date.parse(completedAt) - (durationMin ?? 60) * 60_000) }
      : null;

    // Ad-hoc session without a workout
    if (!workoutId) {
      const session = db.insert(sessions).values({
        programId: null,
        programName: 'Ad-hoc',
        workoutId: null,
        workoutName: 'Quick Workout',
        isAdHoc: true,
        createdAt: past?.createdAt ?? ts,
        completedAt: past?.completedAt ?? null,
        updatedAt: ts,
      }).returning().get();

      res.status(201).json({
        ...session,
        exercises: [],
        sets: [],
      });
      return;
    }

    // Fetch workout with program and exercises
    const workout = await db.query.workouts.findFirst({
      where: eq(workouts.id, workoutId),
      with: {
        program: true,
        exercises: { orderBy: asc(exercises.orderIndex) },
      },
    });

    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    const program = workout.program;

    // Create session with denormalized names (history independence)
    const session = db.insert(sessions).values({
      programId: program?.id || null,
      programName: program?.name || 'Ad-hoc',
      workoutId: workout.id,
      workoutName: workout.name,
      isAdHoc: past ? true : (isAdHoc || false),
      createdAt: past?.createdAt ?? ts,
      completedAt: past?.completedAt ?? null,
      updatedAt: ts,
    }).returning().get();

    // Return session with exercises for frontend
    res.status(201).json({
      ...session,
      exercises: workout.exercises,
      sets: [],
    });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// POST /api/sessions/:id/sets - Log a set
router.post('/:id/sets', validateParams(idParamSchema), validate(logSetSchema), (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);

    const session = findSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Ad-hoc exercises arrive with negative IDs (frontend convention) — store as null
    const incomingExerciseId = req.body.exerciseId;
    const exerciseId = typeof incomingExerciseId === 'number' && incomingExerciseId > 0
      ? incomingExerciseId
      : null;

    // catalogId is derived from the name, never taken from the client (the old
    // APK sends exactly what it always sent and still gets a resolved set back).
    const ts = now();
    const set = db.transaction((tx) => {
      touchSession(tx, sessionId, ts);
      return tx.insert(sets).values({
        sessionId,
        exerciseId,
        exerciseName: req.body.exerciseName,
        catalogId: resolveCatalogId(tx, req.body.exerciseName),
        weight: req.body.weight,
        reps: req.body.reps,
        setNumber: req.body.setNumber,
        perceivedEffort: req.body.perceivedEffort || null,
        dropIndex: req.body.dropIndex || 0,
        heartRateAvg: req.body.heartRateAvg ?? null,
        heartRateMax: req.body.heartRateMax ?? null,
        durationSec: req.body.durationSec ?? null,
        distance: req.body.distance ?? null,
        // A set added to a completed session (history edit) sits at its end, inside
        // the session's window, so HR markers and a later date move stay consistent.
        createdAt: session.completedAt ?? ts,
        updatedAt: ts,
      }).returning().get();
    });

    res.status(201).json(set);
  } catch (error) {
    console.error('Error logging set:', error);
    res.status(500).json({ error: 'Failed to log set' });
  }
});

// PUT /api/sessions/:id/sets/:setId - Update a set (weight, reps, RPE)
router.put('/:id/sets/:setId', validateParams(sessionSetParamsSchema), validate(updateSetSchema), (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);
    const setId = Number(req.params.setId);
    const { weight, reps, perceivedEffort, heartRateAvg, heartRateMax, durationSec, distance, exerciseName, exerciseId } = req.body;

    const session = findSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const set = findSet(setId);
    if (!set) {
      res.status(404).json({ error: 'Set not found' });
      return;
    }

    if (set.sessionId !== sessionId) {
      res.status(400).json({ error: 'Set does not belong to this session' });
      return;
    }

    // Update only provided fields. A re-pointed name (swap carry-over) re-resolves its catalogId.
    const ts = now();
    const updated = db.transaction((tx) => {
      touchSession(tx, sessionId, ts);
      return tx.update(sets).set({
        ...(weight !== undefined && { weight }),
        ...(reps !== undefined && { reps }),
        ...(perceivedEffort !== undefined && { perceivedEffort }),
        ...(heartRateAvg !== undefined && { heartRateAvg }),
        ...(heartRateMax !== undefined && { heartRateMax }),
        ...(durationSec !== undefined && { durationSec }),
        ...(distance !== undefined && { distance }),
        ...(exerciseName !== undefined && { exerciseName, catalogId: resolveCatalogId(tx, exerciseName) }),
        ...(exerciseId !== undefined && { exerciseId }),
        updatedAt: ts,
      }).where(eq(sets.id, setId)).returning().get();
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating set:', error);
    res.status(500).json({ error: 'Failed to update set' });
  }
});

// PUT /api/sessions/:id/exercise-note - Set or clear a per-exercise note on a session
router.put('/:id/exercise-note', validateParams(idParamSchema), validate(setExerciseNoteSchema), (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);
    const { exerciseName, note } = req.body as { exerciseName: string; note: string | null };

    const session = findSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const next = { ...(session.exerciseNotes ?? {}) };
    const trimmed = typeof note === 'string' ? note.trim() : null;
    if (trimmed === null || trimmed === '') {
      delete next[exerciseName];
    } else {
      next[exerciseName] = trimmed;
    }

    const updated = db.update(sessions).set({
      exerciseNotes: Object.keys(next).length > 0 ? next : null,
      updatedAt: now(),
    }).where(eq(sessions.id, sessionId)).returning().get();

    res.json(updated);
  } catch (error) {
    console.error('Error setting exercise note:', error);
    res.status(500).json({ error: 'Failed to set exercise note' });
  }
});

// POST /api/sessions/:id/complete - Complete session
router.post('/:id/complete', validateParams(idParamSchema), validate(completeSessionSchema), async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);
    const { heartRateAvg, heartRateMin, heartRateMax, heartRateSeries } = req.body;

    const session = findSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.completedAt) {
      res.status(400).json({ error: 'Session already completed' });
      return;
    }

    db.transaction((tx) => {
      const ts = now();

      // Complete the session
      tx.update(sessions).set({
        completedAt: ts,
        ...(heartRateAvg !== undefined && { heartRateAvg }),
        ...(heartRateMin !== undefined && { heartRateMin }),
        ...(heartRateMax !== undefined && { heartRateMax }),
        ...(heartRateSeries !== undefined && {
          heartRateSeries: heartRateSeries ? JSON.stringify(heartRateSeries) : null,
        }),
        updatedAt: ts,
      }).where(eq(sessions.id, sessionId)).run();

      // If not ad-hoc, advance program index
      if (!session.isAdHoc && session.programId) {
        const program = tx.select({ currentWorkoutIndex: programs.currentWorkoutIndex })
          .from(programs).where(eq(programs.id, session.programId)).get();

        if (program) {
          const { count } = tx.select({ count: sql<number>`count(*)` })
            .from(workouts).where(eq(workouts.programId, session.programId)).get()!;
          const workoutCount = count || 1;
          tx.update(programs).set({
            currentWorkoutIndex: (program.currentWorkoutIndex + 1) % workoutCount,
            updatedAt: ts,
          }).where(eq(programs.id, session.programId)).run();
        }
      }
    });

    // Fetch updated session with sets
    res.json(await findSessionWithSets(sessionId));
  } catch (error) {
    console.error('Error completing session:', error);
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

// DELETE /api/sessions/:id/sets/:setId - Delete a single set
router.delete('/:id/sets/:setId', validateParams(sessionSetParamsSchema), (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);
    const setId = Number(req.params.setId);

    const session = findSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const set = findSet(setId);
    if (!set) {
      res.status(404).json({ error: 'Set not found' });
      return;
    }

    if (set.sessionId !== sessionId) {
      res.status(400).json({ error: 'Set does not belong to this session' });
      return;
    }

    db.transaction((tx) => {
      touchSession(tx, sessionId, now());
      tx.delete(sets).where(eq(sets.id, setId)).run();
    });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting set:', error);
    res.status(500).json({ error: 'Failed to delete set' });
  }
});

// PUT /api/sessions/:id - Move a completed session's date. Shifts createdAt,
// completedAt and every set's createdAt by the same delta, so the duration,
// HR series (offsets from createdAt) and set markers stay aligned.
router.put('/:id', validateParams(idParamSchema), validate(updateSessionSchema), async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);
    const session = findSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    if (!session.completedAt) {
      res.status(400).json({ error: 'Only a completed session can be edited' });
      return;
    }

    if (req.body.completedAt !== undefined) {
      const delta = Date.parse(req.body.completedAt) - session.completedAt.getTime();
      const shift = (d: Date) => new Date(d.getTime() + delta);
      db.transaction((tx) => {
        tx.update(sessions).set({
          createdAt: shift(session.createdAt),
          completedAt: shift(session.completedAt as Date),
          updatedAt: now(),
        }).where(eq(sessions.id, sessionId)).run();
        // Shift in JS: the stored text format isn't one SQLite's date functions round-trip.
        const rows = tx.select({ id: sets.id, createdAt: sets.createdAt })
          .from(sets).where(eq(sets.sessionId, sessionId)).all();
        for (const row of rows) {
          tx.update(sets).set({ createdAt: shift(row.createdAt) }).where(eq(sets.id, row.id)).run();
        }
      });
    }

    const updated = await findSessionWithSets(sessionId);
    res.json({ ...updated, exercises: workoutExercises(session.workoutId) });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// DELETE /api/sessions/:id - Delete session (SQLite cascades to sets)
router.delete('/:id', validateParams(idParamSchema), (req: Request, res: Response) => {
  try {
    const result = db.delete(sessions).where(eq(sessions.id, Number(req.params.id))).run();
    if (result.changes === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
