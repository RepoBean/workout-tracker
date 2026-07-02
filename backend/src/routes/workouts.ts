import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Workout, Exercise, Program, sequelize } from '../models/index.js';
import { validate, validateParams, idParamSchema } from '../middleware/validate.js';

const router = Router();

// ============================================
// Zod Schemas
// ============================================

const createWorkoutSchema = z.object({
  programId: z.number().int().positive(),
  name: z.string().min(1).max(255),
  orderIndex: z.number().int().min(0),
});

const updateWorkoutSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  orderIndex: z.number().int().min(0).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

const reorderExercisesSchema = z.object({
  exerciseIds: z.array(z.number().int().positive()),
});

const reorderWorkoutsSchema = z.object({
  workoutIds: z.array(z.number().int().positive()),
});

// ============================================
// Routes
// ============================================

// GET /api/workouts/:id - Get single workout with exercises
router.get('/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
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
router.post('/', validate(createWorkoutSchema), async (req: Request, res: Response) => {
  try {
    const { programId, name, orderIndex } = req.body;

    const program = await Program.findByPk(programId);
    if (!program) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    const workout = await Workout.create({ programId, name, orderIndex });
    res.status(201).json(workout);
  } catch (error) {
    console.error('Error creating workout:', error);
    res.status(500).json({ error: 'Failed to create workout' });
  }
});

// PUT /api/workouts/:id - Update workout
router.put('/:id', validateParams(idParamSchema), validate(updateWorkoutSchema), async (req: Request, res: Response) => {
  try {
    const workout = await Workout.findByPk(Number(req.params.id));
    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    const { name, orderIndex } = req.body;
    if (name !== undefined) workout.name = name;
    if (orderIndex !== undefined) workout.orderIndex = orderIndex;

    await workout.save();
    res.json(workout);
  } catch (error) {
    console.error('Error updating workout:', error);
    res.status(500).json({ error: 'Failed to update workout' });
  }
});

// DELETE /api/workouts/:id - Delete workout
router.delete('/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const workout = await Workout.findByPk(Number(req.params.id));
    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    await workout.destroy();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting workout:', error);
    res.status(500).json({ error: 'Failed to delete workout' });
  }
});

// POST /api/workouts/:id/duplicate - Duplicate workout with exercises
router.post('/:id/duplicate', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const original = await Workout.findByPk(Number(req.params.id), {
      include: [{
        model: Exercise,
        as: 'exercises'
      }],
      order: [
        [{ model: Exercise, as: 'exercises' }, 'orderIndex', 'ASC']
      ]
    });

    if (!original) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    const workoutCount = await Workout.count({ where: { programId: original.programId } });
    const originalJSON = original.toJSON() as unknown as Record<string, unknown>;
    const exercises = (originalJSON.exercises as Array<Record<string, unknown>>) || [];

    const newWorkout = await sequelize.transaction(async (t) => {
      const workout = await Workout.create({
        programId: original.programId,
        name: `${original.name} (Copy)`,
        orderIndex: workoutCount,
      }, { transaction: t });

      for (const e of exercises) {
        await Exercise.create({
          workoutId: workout.id,
          name: e.name as string,
          targetSets: e.targetSets as number,
          targetReps: e.targetReps as string,
          orderIndex: e.orderIndex as number,
          supersetGroup: (e.supersetGroup as string) || null,
          exerciseType: (e.exerciseType as 'strength' | 'cardio') || 'strength',
          cardioModality: (e.cardioModality as 'running' | 'cycling' | 'treadmill' | 'rowing' | 'other' | null) || null,
          targetDurationSec: (e.targetDurationSec as number | null) ?? null,
          targetDistance: (e.targetDistance as number | null) ?? null,
        }, { transaction: t });
      }

      return workout;
    });

    const fullWorkout = await Workout.findByPk(newWorkout.id, {
      include: [{
        model: Exercise,
        as: 'exercises'
      }],
      order: [
        [{ model: Exercise, as: 'exercises' }, 'orderIndex', 'ASC']
      ]
    });

    res.status(201).json(fullWorkout);
  } catch (error) {
    console.error('Error duplicating workout:', error);
    res.status(500).json({ error: 'Failed to duplicate workout' });
  }
});

// POST /api/workouts/reorder - Reorder workouts within a program
router.post('/reorder', validate(reorderWorkoutsSchema), async (req: Request, res: Response) => {
  try {
    const { workoutIds } = req.body;

    await sequelize.transaction(async (t) => {
      for (let i = 0; i < workoutIds.length; i++) {
        await Workout.update(
          { orderIndex: i },
          { where: { id: workoutIds[i] }, transaction: t }
        );
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering workouts:', error);
    res.status(500).json({ error: 'Failed to reorder workouts' });
  }
});

// POST /api/workouts/:id/reorder-exercises - Reorder exercises within a workout
router.post('/:id/reorder-exercises', validateParams(idParamSchema), validate(reorderExercisesSchema), async (req: Request, res: Response) => {
  try {
    const workoutId = Number(req.params.id);
    const { exerciseIds } = req.body;

    const workout = await Workout.findByPk(workoutId);
    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    await sequelize.transaction(async (t) => {
      for (let i = 0; i < exerciseIds.length; i++) {
        await Exercise.update(
          { orderIndex: i },
          { where: { id: exerciseIds[i], workoutId }, transaction: t }
        );
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering exercises:', error);
    res.status(500).json({ error: 'Failed to reorder exercises' });
  }
});

export default router;
