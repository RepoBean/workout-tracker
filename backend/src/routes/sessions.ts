import { Router, Request, Response } from 'express';
import { Session, Set as SetModel, Program, Workout, Exercise } from '../models/index.js';
import { Op } from 'sequelize';

const router = Router();

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

// POST /api/sessions/start - Start a new session
router.post('/start', async (req: Request, res: Response) => {
  // TODO: Add Zod validation and implementation
  res.status(501).json({ error: 'Not implemented' });
});

// POST /api/sessions/:id/sets - Log a set
router.post('/:id/sets', async (req: Request, res: Response) => {
  // TODO: Add Zod validation and implementation
  res.status(501).json({ error: 'Not implemented' });
});

// PUT /api/sessions/:id/sets/:setId/effort - Update RPE
router.put('/:id/sets/:setId/effort', async (req: Request, res: Response) => {
  // TODO: Implement
  res.status(501).json({ error: 'Not implemented' });
});

// POST /api/sessions/:id/complete - Complete session
router.post('/:id/complete', async (req: Request, res: Response) => {
  // TODO: Implement with transaction for program index advancement
  res.status(501).json({ error: 'Not implemented' });
});

// DELETE /api/sessions/:id - Delete session
router.delete('/:id', async (req: Request, res: Response) => {
  // TODO: Implement
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
