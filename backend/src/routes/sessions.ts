import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Session, Set as SetModel, Program, Workout, Exercise, sequelize } from '../models/index.js';
import { validate, validateParams, idParamSchema, sessionSetParamsSchema, paginationQuerySchema } from '../middleware/validate.js';
import { Op } from 'sequelize';
import type {
  ProgramWithWorkouts,
  WorkoutWithExercises,
  WorkoutWithProgramAndExercises,
  SessionWithSets,
  SetWithSession,
} from '../types/associations.js';

const router = Router();

const isCardioSet = (s: { durationSec?: number | null; distance?: number | null }): boolean =>
  (s.durationSec ?? 0) > 0 || (s.distance ?? 0) > 0;

// ============================================
// Zod Schemas
// ============================================

const startSessionSchema = z.object({
  workoutId: z.number().int().positive().optional(),
  isAdHoc: z.boolean().optional().default(false),
});

const logSetSchema = z.object({
  exerciseId: z.number().int().nullable().optional(), // negative IDs allowed for ad-hoc
  exerciseName: z.string().min(1).max(255),
  weight: z.number().min(0),
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
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const completedAtFilter: Record<symbol, unknown> = { [Op.ne]: null };
    if (from) completedAtFilter[Op.gte] = from;
    if (to) completedAtFilter[Op.lte] = to;

    const sessions = await Session.findAll({
      where: { completedAt: completedAtFilter },
      include: [{
        model: SetModel,
        as: 'sets'
      }],
      order: [['completedAt', 'DESC']],
      limit,
      offset
    });

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching session history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/sessions/active - Find incomplete session for resume
router.get('/active', async (req: Request, res: Response) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const session = await Session.findOne({
      where: {
        completedAt: null,
        createdAt: { [Op.gte]: twentyFourHoursAgo },
      },
      include: [{ model: SetModel, as: 'sets' }],
      order: [['createdAt', 'DESC']],
    });

    if (!session) {
      res.json(null);
      return;
    }

    // Include exercises from the associated workout
    let exercises: Exercise[] = [];
    if (session.workoutId) {
      const workout = await Workout.findByPk(session.workoutId, {
        include: [{
          model: Exercise,
          as: 'exercises',
        }],
        order: [
          [{ model: Exercise, as: 'exercises' }, 'orderIndex', 'ASC']
        ]
      });
      exercises = (workout as WorkoutWithExercises | null)?.exercises || [];
    }

    res.json({
      ...session.toJSON(),
      exercises,
    });
  } catch (error) {
    console.error('Error fetching active session:', error);
    res.status(500).json({ error: 'Failed to fetch active session' });
  }
});

// GET /api/sessions/export-csv - Export all session history as CSV
router.get('/export-csv', async (req: Request, res: Response) => {
  try {
    const sessions = await Session.findAll({
      where: { completedAt: { [Op.ne]: null } },
      include: [{ model: SetModel, as: 'sets' }],
      order: [['completedAt', 'DESC']],
    });

    // CSV field escaping to prevent formula injection
    const escapeCSV = (value: string | number | null | undefined): string => {
      if (value === null || value === undefined) return '';
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
    const rows: string[] = [];

    for (const session of sessions) {
      const sets = (session as SessionWithSets).sets || [];
      const date = session.completedAt
        ? new Date(session.completedAt).toISOString().split('T')[0]
        : '';

      for (const set of sets) {
        const isCardio = isCardioSet(set);
        rows.push([
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

    const csv = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=workout-history.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// GET /api/sessions/stats - Summary statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Fetch all completed session dates and compute everything in JS
    // This avoids the SQLite strftime week-boundary bug
    const sessions = await Session.findAll({
      where: { completedAt: { [Op.ne]: null } },
      attributes: ['completedAt'],
    });

    const totalSessions = sessions.length;

    // Sessions last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sessionsLast30Days = sessions.filter(
      (s) => new Date(s.completedAt as unknown as string) >= thirtyDaysAgo
    ).length;

    // Week streak: consecutive calendar weeks (Sun-Sat) with >= 1 workout
    // Uses Sunday-based weeks to match JS getDay() where Sunday = 0
    const getSundayWeekKey = (date: Date): string => {
      const d = new Date(date);
      // Roll back to Sunday of this week
      d.setDate(d.getDate() - d.getDay());
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    };

    // Collect distinct weeks that have at least one session
    const activeWeeks = new Set<string>();
    for (const s of sessions) {
      activeWeeks.add(getSundayWeekKey(new Date(s.completedAt as unknown as string)));
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
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/sessions/:id - Get session by ID (includes exercises from workout)
router.get('/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const session = await Session.findByPk(Number(req.params.id), {
      include: [{
        model: SetModel,
        as: 'sets'
      }]
    });

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Include exercises from the associated workout (needed for active session UI)
    let exercises: Exercise[] = [];
    if (session.workoutId) {
      const workout = await Workout.findByPk(session.workoutId, {
        include: [{
          model: Exercise,
          as: 'exercises',
        }],
        order: [
          [{ model: Exercise, as: 'exercises' }, 'orderIndex', 'ASC']
        ]
      });
      exercises = (workout as WorkoutWithExercises | null)?.exercises || [];
    }

    res.json({
      ...session.toJSON(),
      exercises,
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// GET /api/sessions/:id/previous - Get previous session data for hints
// Looks up history by exercise NAME (not workoutId) so ad-hoc and cross-workout history is visible
router.get('/:id/previous', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);

    const currentSession = await Session.findByPk(sessionId);
    if (!currentSession) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Ad-hoc sessions without a workout have no pre-defined exercises to look up
    if (!currentSession.workoutId) {
      res.json({ exerciseData: {} });
      return;
    }

    // Get the workout's exercises
    const workout = await Workout.findByPk(currentSession.workoutId, {
      include: [{ model: Exercise, as: 'exercises' }],
    }) as WorkoutWithExercises | null;

    if (!workout || !workout.exercises?.length) {
      res.json({ exerciseData: {} });
      return;
    }

    // For each exercise, find the most recent sets by exerciseName
    const exerciseData: Record<number, { sets: Array<{ setNumber: number; weight: number; reps: number }> }> = {};

    for (const exercise of workout.exercises) {
      // Find all standard sets with matching exerciseName from completed sessions
      const matchingSets = await SetModel.findAll({
        where: {
          dropIndex: 0, // Only standard sets
        },
        include: [{
          model: Session,
          as: 'session',
          where: {
            completedAt: { [Op.ne]: null },
          },
          attributes: ['id', 'completedAt'],
        }],
        order: [
          [{ model: Session, as: 'session' }, 'completedAt', 'DESC'],
          ['setNumber', 'ASC'],
        ],
      });

      // Filter by name (case-insensitive) since SQLite LOWER() in Sequelize is tricky
      const filtered = matchingSets.filter(
        set => set.exerciseName.toLowerCase() === exercise.name.toLowerCase()
      );

      if (filtered.length === 0) {
        continue;
      }

      // Get the most recent session's sets
      const mostRecentSet = filtered[0] as SetWithSession;
      const mostRecentSessionId = mostRecentSet.session.id;

      const setsFromMostRecent = filtered
        .filter(set => (set as SetWithSession).session.id === mostRecentSessionId)
        .map(set => ({
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          perceivedEffort: set.perceivedEffort,
        }));

      exerciseData[exercise.id] = { sets: setsFromMostRecent };
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
    const { workoutId, isAdHoc } = req.body;

    // Ad-hoc session without a workout
    if (!workoutId) {
      const session = await Session.create({
        programId: null,
        programName: 'Ad-hoc',
        workoutId: null,
        workoutName: 'Quick Workout',
        isAdHoc: true,
      });

      res.status(201).json({
        ...session.toJSON(),
        exercises: [],
        sets: [],
      });
      return;
    }

    // Fetch workout with program and exercises
    const workout = await Workout.findByPk(workoutId, {
      include: [
        { model: Program, as: 'program' },
        {
          model: Exercise,
          as: 'exercises',
          order: [['orderIndex', 'ASC']]
        }
      ],
      order: [
        [{ model: Exercise, as: 'exercises' }, 'orderIndex', 'ASC']
      ]
    });

    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    const workoutFull = workout as WorkoutWithProgramAndExercises;
    const program = workoutFull.program;

    // Create session with denormalized names (history independence)
    const session = await Session.create({
      programId: program?.id || null,
      programName: program?.name || 'Ad-hoc',
      workoutId: workout.id,
      workoutName: workout.name,
      isAdHoc: isAdHoc || false,
    });

    // Return session with exercises for frontend
    res.status(201).json({
      ...session.toJSON(),
      exercises: workoutFull.exercises || [],
      sets: [],
    });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// POST /api/sessions/:id/sets - Log a set
router.post('/:id/sets', validateParams(idParamSchema), validate(logSetSchema), async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);

    const session = await Session.findByPk(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.completedAt) {
      res.status(400).json({ error: 'Cannot add sets to completed session' });
      return;
    }

    // Ad-hoc exercises arrive with negative IDs (frontend convention) — store as null
    const incomingExerciseId = req.body.exerciseId;
    const exerciseId = typeof incomingExerciseId === 'number' && incomingExerciseId > 0
      ? incomingExerciseId
      : null;

    const set = await SetModel.create({
      sessionId,
      exerciseId,
      exerciseName: req.body.exerciseName,
      weight: req.body.weight,
      reps: req.body.reps,
      setNumber: req.body.setNumber,
      perceivedEffort: req.body.perceivedEffort || null,
      dropIndex: req.body.dropIndex || 0,
      heartRateAvg: req.body.heartRateAvg ?? null,
      heartRateMax: req.body.heartRateMax ?? null,
      durationSec: req.body.durationSec ?? null,
      distance: req.body.distance ?? null,
    });

    res.status(201).json(set);
  } catch (error) {
    console.error('Error logging set:', error);
    res.status(500).json({ error: 'Failed to log set' });
  }
});

// Update set schema. exerciseName/exerciseId support re-pointing a set at a
// different exercise (swap carry-over); only null is accepted for exerciseId —
// re-pointed sets become name-keyed ad-hoc, never attached to another program
// exercise's positive id.
const updateSetSchema = z.object({
  weight: z.number().min(0).optional(),
  reps: z.number().int().min(0).optional(),
  perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
  heartRateAvg: z.number().int().min(20).max(250).nullable().optional(),
  heartRateMax: z.number().int().min(20).max(250).nullable().optional(),
  durationSec: z.number().int().min(1).nullable().optional(),
  distance: z.number().min(0).nullable().optional(),
  exerciseName: z.string().min(1).max(255).optional(),
  exerciseId: z.null().optional(),
});

// PUT /api/sessions/:id/sets/:setId - Update a set (weight, reps, RPE)
router.put('/:id/sets/:setId', validateParams(sessionSetParamsSchema), validate(updateSetSchema), async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);
    const setId = Number(req.params.setId);
    const { weight, reps, perceivedEffort, heartRateAvg, heartRateMax, durationSec, distance, exerciseName, exerciseId } = req.body;

    const session = await Session.findByPk(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.completedAt) {
      res.status(400).json({ error: 'Cannot edit sets in completed session' });
      return;
    }

    const set = await SetModel.findByPk(setId);
    if (!set) {
      res.status(404).json({ error: 'Set not found' });
      return;
    }

    if (set.sessionId !== sessionId) {
      res.status(400).json({ error: 'Set does not belong to this session' });
      return;
    }

    // Update only provided fields
    if (weight !== undefined) set.weight = weight;
    if (reps !== undefined) set.reps = reps;
    if (perceivedEffort !== undefined) set.perceivedEffort = perceivedEffort;
    if (heartRateAvg !== undefined) set.heartRateAvg = heartRateAvg;
    if (heartRateMax !== undefined) set.heartRateMax = heartRateMax;
    if (durationSec !== undefined) set.durationSec = durationSec;
    if (distance !== undefined) set.distance = distance;
    if (exerciseName !== undefined) set.exerciseName = exerciseName;
    if (exerciseId !== undefined) set.exerciseId = exerciseId;

    await set.save();

    res.json(set);
  } catch (error) {
    console.error('Error updating set:', error);
    res.status(500).json({ error: 'Failed to update set' });
  }
});

// PUT /api/sessions/:id/exercise-note - Set or clear a per-exercise note on a session
router.put('/:id/exercise-note', validateParams(idParamSchema), validate(setExerciseNoteSchema), async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);
    const { exerciseName, note } = req.body as { exerciseName: string; note: string | null };

    const session = await Session.findByPk(sessionId);
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

    session.exerciseNotes = Object.keys(next).length > 0 ? next : null;
    session.changed('exerciseNotes', true);
    await session.save();

    res.json(session);
  } catch (error) {
    console.error('Error setting exercise note:', error);
    res.status(500).json({ error: 'Failed to set exercise note' });
  }
});

// POST /api/sessions/:id/complete - Complete session
router.post('/:id/complete', validateParams(idParamSchema), validate(completeSessionSchema), async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);
    const { heartRateAvg, heartRateMin, heartRateMax } = req.body;

    const session = await Session.findByPk(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.completedAt) {
      res.status(400).json({ error: 'Session already completed' });
      return;
    }

    await sequelize.transaction(async (t) => {
      // Complete the session
      session.completedAt = new Date();
      if (heartRateAvg !== undefined) session.heartRateAvg = heartRateAvg;
      if (heartRateMin !== undefined) session.heartRateMin = heartRateMin;
      if (heartRateMax !== undefined) session.heartRateMax = heartRateMax;
      if (req.body.heartRateSeries !== undefined) {
        session.heartRateSeries = req.body.heartRateSeries
          ? JSON.stringify(req.body.heartRateSeries)
          : null;
      }
      await session.save({ transaction: t });

      // If not ad-hoc, advance program index
      if (!session.isAdHoc && session.programId) {
        const program = await Program.findByPk(session.programId, {
          include: [{ model: Workout, as: 'workouts' }],
          transaction: t,
        });

        if (program) {
          const workoutCount = (program as ProgramWithWorkouts).workouts?.length || 1;
          program.currentWorkoutIndex = (program.currentWorkoutIndex + 1) % workoutCount;
          await program.save({ transaction: t });
        }
      }
    });

    // Fetch updated session with sets
    const updatedSession = await Session.findByPk(sessionId, {
      include: [{ model: SetModel, as: 'sets' }]
    });

    res.json(updatedSession);
  } catch (error) {
    console.error('Error completing session:', error);
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

// DELETE /api/sessions/:id/sets/:setId - Delete a single set
router.delete('/:id/sets/:setId', validateParams(sessionSetParamsSchema), async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);
    const setId = Number(req.params.setId);

    const session = await Session.findByPk(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.completedAt) {
      res.status(400).json({ error: 'Cannot delete sets from completed session' });
      return;
    }

    const set = await SetModel.findByPk(setId);
    if (!set) {
      res.status(404).json({ error: 'Set not found' });
      return;
    }

    if (set.sessionId !== sessionId) {
      res.status(400).json({ error: 'Set does not belong to this session' });
      return;
    }

    await set.destroy();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting set:', error);
    res.status(500).json({ error: 'Failed to delete set' });
  }
});

// DELETE /api/sessions/:id - Delete session
router.delete('/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);

    const session = await Session.findByPk(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await session.destroy();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;
