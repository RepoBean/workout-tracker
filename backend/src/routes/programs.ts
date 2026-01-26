import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Program, Workout, Exercise, sequelize } from '../models/index.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// ============================================
// Zod Schemas
// ============================================

const createProgramSchema = z.object({
  name: z.string().min(1).max(255),
});

const updateProgramSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  currentWorkoutIndex: z.number().int().min(0).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

// ============================================
// Routes
// ============================================

// GET /api/programs - List all non-archived programs
router.get('/', async (req: Request, res: Response) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const where = includeArchived ? {} : { isArchived: false };

    const programs = await Program.findAll({
      where,
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
router.post('/', validate(createProgramSchema), async (req: Request, res: Response) => {
  try {
    const program = await Program.create({
      name: req.body.name,
    });
    res.status(201).json(program);
  } catch (error) {
    console.error('Error creating program:', error);
    res.status(500).json({ error: 'Failed to create program' });
  }
});

// PUT /api/programs/:id - Update program
router.put('/:id', validate(updateProgramSchema), async (req: Request, res: Response) => {
  try {
    const program = await Program.findByPk(Number(req.params.id));
    if (!program) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    const { name, isActive, isArchived, currentWorkoutIndex } = req.body;
    if (name !== undefined) program.name = name;
    if (isActive !== undefined) program.isActive = isActive;
    if (isArchived !== undefined) program.isArchived = isArchived;
    if (currentWorkoutIndex !== undefined) program.currentWorkoutIndex = currentWorkoutIndex;

    await program.save();
    res.json(program);
  } catch (error) {
    console.error('Error updating program:', error);
    res.status(500).json({ error: 'Failed to update program' });
  }
});

// PUT /api/programs/:id/set-active - Set program as active
router.put('/:id/set-active', async (req: Request, res: Response) => {
  try {
    const programId = Number(req.params.id);

    await sequelize.transaction(async (t) => {
      // Deactivate all programs
      await Program.update({ isActive: false }, {
        where: {},
        transaction: t,
      });

      // Activate target program (and unarchive if needed)
      const [updatedCount] = await Program.update(
        { isActive: true, isArchived: false },
        { where: { id: programId }, transaction: t }
      );

      if (updatedCount === 0) {
        throw new Error('Program not found');
      }
    });

    const program = await Program.findByPk(programId, {
      include: [{
        model: Workout,
        as: 'workouts',
        include: [{ model: Exercise, as: 'exercises' }]
      }],
      order: [
        [{ model: Workout, as: 'workouts' }, 'orderIndex', 'ASC'],
        [{ model: Workout, as: 'workouts' }, { model: Exercise, as: 'exercises' }, 'orderIndex', 'ASC']
      ]
    });

    res.json(program);
  } catch (error: any) {
    if (error.message === 'Program not found') {
      res.status(404).json({ error: 'Program not found' });
      return;
    }
    console.error('Error activating program:', error);
    res.status(500).json({ error: 'Failed to activate program' });
  }
});

// DELETE /api/programs/:id - Archive program (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const program = await Program.findByPk(Number(req.params.id));
    if (!program) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    program.isArchived = true;
    program.isActive = false;
    await program.save();

    res.status(204).send();
  } catch (error) {
    console.error('Error archiving program:', error);
    res.status(500).json({ error: 'Failed to archive program' });
  }
});

export default router;
