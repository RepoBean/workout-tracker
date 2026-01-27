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

const importExerciseSchema = z.object({
  name: z.string().min(1).max(255),
  targetSets: z.number().int().min(1),
  targetReps: z.string().min(1).max(50),
  orderIndex: z.number().int().min(0),
  supersetGroup: z.enum(['A', 'B', 'C', 'D', 'E']).nullable().optional().default(null),
});

const importWorkoutSchema = z.object({
  name: z.string().min(1).max(255),
  orderIndex: z.number().int().min(0),
  exercises: z.array(importExerciseSchema).max(100).default([]),
});

const importProgramSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  program: z.object({
    name: z.string().min(1).max(255),
    workouts: z.array(importWorkoutSchema).max(50).default([]),
  }),
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

// GET /api/programs/:id/export - Export program as JSON
router.get('/:id/export', async (req: Request, res: Response) => {
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

    const programJSON = program.toJSON() as unknown as Record<string, unknown>;
    const workouts = (programJSON.workouts as Array<Record<string, unknown>>) || [];

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      program: {
        name: program.name,
        workouts: workouts.map((w) => ({
          name: w.name as string,
          orderIndex: w.orderIndex as number,
          exercises: ((w.exercises as Array<Record<string, unknown>>) || []).map((e) => ({
            name: e.name as string,
            targetSets: e.targetSets as number,
            targetReps: e.targetReps as string,
            orderIndex: e.orderIndex as number,
            supersetGroup: (e.supersetGroup as string) || null,
          })),
        })),
      },
    };

    const sanitized = program.name.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitized}.json"`);
    res.status(200).json(exportData);
  } catch (error) {
    console.error('Error exporting program:', error);
    res.status(500).json({ error: 'Failed to export program' });
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

// POST /api/programs/import - Import program from JSON
router.post('/import', validate(importProgramSchema), async (req: Request, res: Response) => {
  try {
    const data = req.body;

    const program = await sequelize.transaction(async (t) => {
      const newProgram = await Program.create({
        name: data.program.name,
        isActive: false,
        isArchived: false,
        currentWorkoutIndex: 0,
      }, { transaction: t });

      for (const workoutData of data.program.workouts) {
        const newWorkout = await Workout.create({
          programId: newProgram.id,
          name: workoutData.name,
          orderIndex: workoutData.orderIndex,
        }, { transaction: t });

        for (const exerciseData of workoutData.exercises) {
          await Exercise.create({
            workoutId: newWorkout.id,
            name: exerciseData.name,
            targetSets: exerciseData.targetSets,
            targetReps: exerciseData.targetReps,
            orderIndex: exerciseData.orderIndex,
            supersetGroup: exerciseData.supersetGroup || null,
          }, { transaction: t });
        }
      }

      return newProgram;
    });

    const fullProgram = await Program.findByPk(program.id, {
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

    res.status(201).json(fullProgram);
  } catch (error) {
    console.error('Error importing program:', error);
    res.status(500).json({ error: 'Failed to import program' });
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
