import { Router, Request, Response } from 'express';
import { Program, Workout, Exercise } from '../models/index.js';

const router = Router();

// GET /api/programs - List all non-archived programs
router.get('/', async (req: Request, res: Response) => {
  try {
    const programs = await Program.findAll({
      where: { isArchived: false },
      include: [{
        model: Workout,
        as: 'workouts',
        include: [{
          model: Exercise,
          as: 'exercises'
        }]
      }],
      order: [
        ['isActive', 'DESC'],
        ['name', 'ASC'],
        [{ model: Workout, as: 'workouts' }, 'orderIndex', 'ASC'],
        [{ model: Workout, as: 'workouts' }, { model: Exercise, as: 'exercises' }, 'orderIndex', 'ASC']
      ]
    });
    res.json(programs);
  } catch (error) {
    console.error('Error fetching programs:', error);
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

// GET /api/programs/:id - Get single program with workouts and exercises
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const program = await Program.findByPk(Number(req.params.id), {
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

    if (!program) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    res.json(program);
  } catch (error) {
    console.error('Error fetching program:', error);
    res.status(500).json({ error: 'Failed to fetch program' });
  }
});

// POST /api/programs - Create new program
router.post('/', async (req: Request, res: Response) => {
  // TODO: Add Zod validation
  res.status(501).json({ error: 'Not implemented' });
});

// PUT /api/programs/:id - Update program
router.put('/:id', async (req: Request, res: Response) => {
  // TODO: Implement
  res.status(501).json({ error: 'Not implemented' });
});

// PUT /api/programs/:id/set-active - Set program as active
router.put('/:id/set-active', async (req: Request, res: Response) => {
  // TODO: Implement with transaction
  res.status(501).json({ error: 'Not implemented' });
});

// DELETE /api/programs/:id - Archive program (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  // TODO: Implement (set isArchived = true)
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
