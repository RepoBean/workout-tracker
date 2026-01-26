import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Session, Set as SetModel, Program, Workout, Exercise, sequelize } from '../models/index.js';
import { validate } from '../middleware/validate.js';
import { Op } from 'sequelize';

const router = Router();

// ============================================
// Zod Schemas
// ============================================

const startSessionSchema = z.object({
  workoutId: z.number().int().positive(),
  isAdHoc: z.boolean().optional().default(false),
});

const logSetSchema = z.object({
  exerciseId: z.number().int().positive().nullable().optional(),
  exerciseName: z.string().min(1).max(255),
  weight: z.number().min(0),
  reps: z.number().int().min(1),
  setNumber: z.number().int().min(1),
  perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
});

// ============================================
// Routes
// ============================================

// GET /api/sessions/history - Get session history with pagination
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const sessions = await Session.findAll({
      where: { completedAt: { [Op.ne]: null } },
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

// GET /api/sessions/next-workout - Get next workout for active program
router.get('/next-workout', async (req: Request, res: Response) => {
  try {
    const activeProgram = await Program.findOne({
      where: { isActive: true, isArchived: false },
      include: [{
        model: Workout,
        as: 'workouts',
        include: [{
          model: Exercise,
          as: 'exercises'
        }]
      }],
      order: [
        [{ model: Workout, as: 'workouts' }, 'orderIndex', 'ASC'],
        [{ model: Workout, as: 'workouts' }, { model: Exercise, as: 'exercises' }, 'orderIndex', 'ASC']
      ]
    });

    if (!activeProgram) {
      res.status(404).json({ error: 'No active program found' });
      return;
    }

    const workouts = (activeProgram as any).workouts || [];
    if (workouts.length === 0) {
      res.status(404).json({ error: 'Active program has no workouts' });
      return;
    }

    const nextIndex = activeProgram.currentWorkoutIndex % workouts.length;
    const nextWorkout = workouts[nextIndex];

    res.json({
      program: {
        id: activeProgram.id,
        name: activeProgram.name,
        currentWorkoutIndex: activeProgram.currentWorkoutIndex
      },
      workout: nextWorkout
    });
  } catch (error) {
    console.error('Error fetching next workout:', error);
    res.status(500).json({ error: 'Failed to fetch next workout' });
  }
});

// GET /api/sessions/:id - Get session by ID
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

    res.json(session);
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

    // Build a map: exerciseId -> { lastWeight, lastReps }
    const exerciseData: Record<number, { lastWeight: number; lastReps: number }> = {};

    for (const set of (previousSession as any).sets || []) {
      if (set.exerciseId) {
        // Keep the last (highest set number) for each exercise
        if (!exerciseData[set.exerciseId] || set.setNumber > exerciseData[set.exerciseId].lastWeight) {
          exerciseData[set.exerciseId] = {
            lastWeight: set.weight,
            lastReps: set.reps
          };
        }
      }
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

    const program = (workout as any).program;

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
      exercises: (workout as any).exercises || [],
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
    });

    res.status(201).json(set);
  } catch (error) {
    console.error('Error logging set:', error);
    res.status(500).json({ error: 'Failed to log set' });
  }
});

// PUT /api/sessions/:id/sets/:setId/effort - Update RPE
router.put('/:id/sets/:setId/effort', async (req: Request, res: Response) => {
  try {
    const setId = Number(req.params.setId);
    const { perceivedEffort } = req.body;

    if (perceivedEffort !== null && (perceivedEffort < 1 || perceivedEffort > 10)) {
      res.status(400).json({ error: 'Perceived effort must be between 1 and 10' });
      return;
    }

    const set = await SetModel.findByPk(setId);
    if (!set) {
      res.status(404).json({ error: 'Set not found' });
      return;
    }

    set.perceivedEffort = perceivedEffort;
    await set.save();

    res.json(set);
  } catch (error) {
    console.error('Error updating RPE:', error);
    res.status(500).json({ error: 'Failed to update RPE' });
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
          const workoutCount = (program as any).workouts?.length || 1;
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
