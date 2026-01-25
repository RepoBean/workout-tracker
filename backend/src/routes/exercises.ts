import { Router, Request, Response } from 'express';
import { Exercise, Set as SetModel } from '../models/index.js';
import { Op } from 'sequelize';

const router = Router();

// GET /api/exercises/suggestions - Autocomplete suggestions
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query || query.length < 2) {
      res.json([]);
      return;
    }

    // Get distinct exercise names from both Exercise and Set tables
    const exerciseNames = await Exercise.findAll({
      attributes: ['name'],
      where: {
        name: {
          [Op.like]: `%${query}%`
        }
      },
      group: ['name'],
      limit: 10
    });

    const setExerciseNames = await SetModel.findAll({
      attributes: ['exerciseName'],
      where: {
        exerciseName: {
          [Op.like]: `%${query}%`
        }
      },
      group: ['exerciseName'],
      limit: 10
    });

    // Combine and dedupe
    const allNames = new globalThis.Set([
      ...exerciseNames.map(e => e.name),
      ...setExerciseNames.map(s => s.exerciseName)
    ]);

    res.json(Array.from(allNames).slice(0, 10));
  } catch (error) {
    console.error('Error fetching exercise suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// GET /api/exercises/:id - Get single exercise
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const exercise = await Exercise.findByPk(Number(req.params.id));

    if (!exercise) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }

    res.json(exercise);
  } catch (error) {
    console.error('Error fetching exercise:', error);
    res.status(500).json({ error: 'Failed to fetch exercise' });
  }
});

// POST /api/exercises - Create new exercise
router.post('/', async (req: Request, res: Response) => {
  // TODO: Add Zod validation
  res.status(501).json({ error: 'Not implemented' });
});

// PUT /api/exercises/:id - Update exercise
router.put('/:id', async (req: Request, res: Response) => {
  // TODO: Implement
  res.status(501).json({ error: 'Not implemented' });
});

// DELETE /api/exercises/:id - Delete exercise
router.delete('/:id', async (req: Request, res: Response) => {
  // TODO: Implement
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
