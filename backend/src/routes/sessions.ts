import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Session, Set as SetModel, Program, Workout, Exercise, sequelize } from '../models/index.js';
import { validate } from '../middleware/validate.js';
import { Op } from 'sequelize';
import type {
  ProgramWithWorkouts,
  WorkoutWithExercises,
  WorkoutWithProgramAndExercises,
  SessionWithSets,
  VolumeQueryResult,
  MonthVolumeQueryResult,
  StreakQueryResult,
} from '../types/associations.js';

const router = Router();

// ============================================
// Zod Schemas
// ============================================

const startSessionSchema = z.object({
  workoutId: z.number().int().positive().optional(),
  isAdHoc: z.boolean().optional().default(false),
});

const logSetSchema = z.object({
  exerciseId: z.number().int().positive().nullable().optional(),
  exerciseName: z.string().min(1).max(255),
  weight: z.number().min(0),
  reps: z.number().int().min(1),
  setNumber: z.number().int().min(1),
  perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
  dropIndex: z.number().int().min(0).optional().default(0),
});

// ============================================
// Routes
// ============================================

// GET /api/sessions/history - Get session history with pagination and optional date range
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
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

    const header = 'Date,Program,Workout,Exercise,Set#,Weight(lbs),Reps,RPE,DropIndex';
    const rows: string[] = [];

    for (const session of sessions) {
      const sets = (session as SessionWithSets).sets || [];
      const date = session.completedAt
        ? new Date(session.completedAt).toISOString().split('T')[0]
        : '';

      for (const set of sets) {
        rows.push([
          escapeCSV(date),
          escapeCSV(session.programName),
          escapeCSV(session.workoutName),
          escapeCSV(set.exerciseName),
          escapeCSV(set.setNumber),
          escapeCSV(set.weight),
          escapeCSV(set.reps),
          escapeCSV(set.perceivedEffort),
          escapeCSV(set.dropIndex),
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
    // Timezone offset in minutes (e.g., -600 for UTC+10, 300 for UTC-5)
    // Matches JavaScript's getTimezoneOffset() which returns minutes
    // Positive = west of UTC, negative = east of UTC
    const tzOffset = parseInt(req.query.tzOffset as string) || 0;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total completed sessions
    const totalSessions = await Session.count({
      where: { completedAt: { [Op.ne]: null } },
    });

    // Sessions last 7 days
    const sessionsLast7Days = await Session.count({
      where: {
        completedAt: { [Op.ne]: null, [Op.gte]: sevenDaysAgo },
      },
    });

    // Sessions last 30 days
    const sessionsLast30Days = await Session.count({
      where: {
        completedAt: { [Op.ne]: null, [Op.gte]: thirtyDaysAgo },
      },
    });

    // Total sets and volume
    const [volumeResult] = await sequelize.query(`
      SELECT
        COUNT(*) as totalSets,
        COALESCE(SUM(weight * reps), 0) as totalVolume
      FROM Sets
      WHERE sessionId IN (
        SELECT id FROM Sessions WHERE completedAt IS NOT NULL
      )
    `);
    const volumeRows = volumeResult as VolumeQueryResult[];
    const totalSets = Number(volumeRows[0]?.totalSets) || 0;
    const totalVolume = Number(volumeRows[0]?.totalVolume) || 0;

    // Volume last 30 days
    const [monthVolumeResult] = await sequelize.query(`
      SELECT COALESCE(SUM(s.weight * s.reps), 0) as monthVolume
      FROM Sets s
      JOIN Sessions sess ON s.sessionId = sess.id
      WHERE sess.completedAt IS NOT NULL
        AND sess.completedAt >= :thirtyDaysAgo
    `, { replacements: { thirtyDaysAgo: thirtyDaysAgo.toISOString() } });
    const monthRows = monthVolumeResult as MonthVolumeQueryResult[];
    const monthVolume = Number(monthRows[0]?.monthVolume) || 0;

    // Current streak: consecutive days with sessions counting back from today
    // Convert UTC timestamps to user's local date using timezone offset
    // tzOffset from getTimezoneOffset() is positive for west of UTC, negative for east
    // To convert UTC to local: subtract tzOffset (since east = negative = add hours)
    const offsetSeconds = -tzOffset * 60; // Convert minutes to seconds, flip sign

    const [streakResult] = await sequelize.query(`
      SELECT DISTINCT date(datetime(completedAt, '${offsetSeconds >= 0 ? '+' : ''}${offsetSeconds} seconds')) as sessionDate
      FROM Sessions
      WHERE completedAt IS NOT NULL
      ORDER BY sessionDate DESC
    `);
    const streakRows = streakResult as StreakQueryResult[];

    let currentStreak = 0;
    // Calculate "today" from the user's timezone perspective
    // Subtract tzOffset from UTC to get user's local time
    const userNow = new Date(now.getTime() - tzOffset * 60 * 1000);
    const todayStr = userNow.toISOString().split('T')[0];

    for (let i = 0; i < streakRows.length; i++) {
      const expectedDate = new Date(todayStr);
      expectedDate.setDate(expectedDate.getDate() - i);
      const expectedStr = expectedDate.toISOString().split('T')[0];

      if (streakRows[i].sessionDate === expectedStr) {
        currentStreak++;
      } else {
        break;
      }
    }

    res.json({
      totalSessions,
      totalSets,
      totalVolume,
      sessionsLast7Days,
      sessionsLast30Days,
      monthVolume,
      currentStreak,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/sessions/:id - Get session by ID (includes exercises from workout)
router.get('/:id', async (req: Request, res: Response) => {
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
router.get('/:id/previous', async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);

    const currentSession = await Session.findByPk(sessionId);
    if (!currentSession) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Find the most recent completed session for the same workout
    const previousSession = await Session.findOne({
      where: {
        workoutId: currentSession.workoutId,
        completedAt: { [Op.ne]: null },
        id: { [Op.ne]: sessionId },
      },
      include: [{ model: SetModel, as: 'sets' }],
      order: [['completedAt', 'DESC']],
    });

    if (!previousSession) {
      res.json({ exerciseData: {} });
      return;
    }

    // Build a map: exerciseId -> { sets: [...] } with all standard sets
    const exerciseData: Record<number, { sets: Array<{ setNumber: number; weight: number; reps: number }> }> = {};

    for (const set of (previousSession as SessionWithSets).sets || []) {
      if (set.exerciseId) {
        if (!exerciseData[set.exerciseId]) {
          exerciseData[set.exerciseId] = { sets: [] };
        }
        // Only include standard sets (dropIndex = 0)
        if ((set.dropIndex || 0) === 0) {
          exerciseData[set.exerciseId].sets.push({
            setNumber: set.setNumber,
            weight: set.weight,
            reps: set.reps,
          });
        }
      }
    }

    // Sort sets by setNumber
    for (const data of Object.values(exerciseData)) {
      data.sets.sort((a, b) => a.setNumber - b.setNumber);
    }

    res.json({
      exerciseData,
      previousSessionId: previousSession.id
    });
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
router.post('/:id/sets', validate(logSetSchema), async (req: Request, res: Response) => {
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

    const set = await SetModel.create({
      sessionId,
      exerciseId: req.body.exerciseId || null,
      exerciseName: req.body.exerciseName,
      weight: req.body.weight,
      reps: req.body.reps,
      setNumber: req.body.setNumber,
      perceivedEffort: req.body.perceivedEffort || null,
      dropIndex: req.body.dropIndex || 0,
    });

    res.status(201).json(set);
  } catch (error) {
    console.error('Error logging set:', error);
    res.status(500).json({ error: 'Failed to log set' });
  }
});

// Update set schema
const updateSetSchema = z.object({
  weight: z.number().min(0).optional(),
  reps: z.number().int().min(1).optional(),
  perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
});

// PUT /api/sessions/:id/sets/:setId - Update a set (weight, reps, RPE)
router.put('/:id/sets/:setId', validate(updateSetSchema), async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);
    const setId = Number(req.params.setId);
    const { weight, reps, perceivedEffort } = req.body;

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

    await set.save();

    res.json(set);
  } catch (error) {
    console.error('Error updating set:', error);
    res.status(500).json({ error: 'Failed to update set' });
  }
});

// POST /api/sessions/:id/complete - Complete session
router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const sessionId = Number(req.params.id);

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
router.delete('/:id/sets/:setId', async (req: Request, res: Response) => {
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
router.delete('/:id', async (req: Request, res: Response) => {
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
