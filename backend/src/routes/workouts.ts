import { Router, Request, Response } from 'express';
import { Workout, Exercise } from '../models/index.js';

const router = Router();

// GET /api/workouts/:id - Get single workout with exercises
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const workout = await Workout.findByPk(Number(req.params.id), {
      include: [{
        model: Exercise,
        as: 'exercises'
      }],
      order: [
        [{ model: Exercise, as: 'exercises' }, 'orderIndex', 'ASC']
      ]
    });

    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    res.json(workout);
  } catch (error) {
    console.error('Error fetching workout:', error);
    res.status(500).json({ error: 'Failed to fetch workout' });
  }
});

// POST /api/workouts - Create new workout
router.post('/', async (req: Request, res: Response) => {
  // TODO: Add Zod validation
  res.status(501).json({ error: 'Not implemented' });
});

// PUT /api/workouts/:id - Update workout
router.put('/:id', async (req: Request, res: Response) => {
  // TODO: Implement
  res.status(501).json({ error: 'Not implemented' });
});

// DELETE /api/workouts/:id - Delete workout
router.delete('/:id', async (req: Request, res: Response) => {
  // TODO: Implement
  res.status(501).json({ error: 'Not implemented' });
});

// POST /api/workouts/:id/reorder-exercises - Reorder exercises
router.post('/:id/reorder-exercises', async (req: Request, res: Response) => {
  // TODO: Implement with transaction
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
