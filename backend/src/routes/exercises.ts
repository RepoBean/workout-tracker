import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Exercise, Workout, Set as SetModel, Session } from '../models/index.js';
import { validate, validateParams, idParamSchema } from '../middleware/validate.js';
import { Op } from 'sequelize';
import type { SetWithSession } from '../types/associations.js';

const router = Router();

// ============================================
// Zod Schemas
// ============================================

const exerciseTypeSchema = z.enum(['strength', 'cardio']);
const cardioModalitySchema = z.enum(['running', 'cycling', 'treadmill', 'rowing', 'other']);

const createExerciseSchema = z.object({
  workoutId: z.number().int().positive(),
  name: z.string().min(1).max(255),
  targetSets: z.number().int().min(1),
  targetReps: z.string().min(1).max(50),
  orderIndex: z.number().int().min(0),
  supersetGroup: z.enum(['A', 'B', 'C', 'D', 'E']).nullable().optional(),
  exerciseType: exerciseTypeSchema.optional().default('strength'),
  cardioModality: cardioModalitySchema.nullable().optional(),
  targetDurationSec: z.number().int().min(1).nullable().optional(),
  targetDistance: z.number().min(0).nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.exerciseType === 'cardio') {
    const hasDuration = (data.targetDurationSec ?? 0) > 0;
    const hasDistance = (data.targetDistance ?? 0) > 0;
    if (!hasDuration && !hasDistance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetDurationSec'],
        message: 'Cardio exercises require a target duration or distance',
      });
    }
  }
});

const updateExerciseSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  targetSets: z.number().int().min(1).optional(),
  targetReps: z.string().min(1).max(50).optional(),
  orderIndex: z.number().int().min(0).optional(),
  supersetGroup: z.enum(['A', 'B', 'C', 'D', 'E']).nullable().optional(),
  exerciseType: exerciseTypeSchema.optional(),
  cardioModality: cardioModalitySchema.nullable().optional(),
  targetDurationSec: z.number().int().min(1).nullable().optional(),
  targetDistance: z.number().min(0).nullable().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided',
});

const historyByNameSchema = z.object({
  name: z.string().min(1),
});

const allSetsByNameSchema = z.object({
  name: z.string().min(1),
});

// ============================================
// Routes
// ============================================

// GET /api/exercises/history-by-name - Get exercise history by name
router.get('/history-by-name', async (req: Request, res: Response) => {
  try {
    const result = historyByNameSchema.safeParse({ name: req.query.name });
    if (!result.success) {
      res.status(400).json({ error: 'Name parameter is required' });
      return;
    }

    const { name } = result.data;

    // Find all sets with matching exerciseName from completed sessions
    const matchingSets = await SetModel.findAll({
      where: {
        dropIndex: 0, // Only standard sets
      },
      include: [{
        model: Session,
        as: 'session',
        where: {
          completedAt: { [Op.not]: null },
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
      set => set.exerciseName.toLowerCase() === name.toLowerCase()
    );

    if (filtered.length === 0) {
      res.json({ sets: [], fromSessionDate: null });
      return;
    }

    // Get the most recent session's sets
    const mostRecentSet = filtered[0] as SetWithSession;
    const mostRecentSessionId = mostRecentSet.session.id;
    const mostRecentDate = mostRecentSet.session.completedAt;

    const setsFromMostRecent = filtered
      .filter(set => (set as SetWithSession).session.id === mostRecentSessionId)
      .map(set => ({
        setNumber: set.setNumber,
        weight: set.weight,
        reps: set.reps,
        perceivedEffort: set.perceivedEffort,
      }));

    res.json({
      sets: setsFromMostRecent,
      fromSessionDate: mostRecentDate,
    });
  } catch (error) {
    console.error('Error fetching exercise history by name:', error);
    res.status(500).json({ error: 'Failed to fetch exercise history' });
  }
});

// GET /api/exercises/all-sets-by-name - All standard sets for an exercise across all completed sessions
router.get('/all-sets-by-name', async (req: Request, res: Response) => {
  try {
    const result = allSetsByNameSchema.safeParse({ name: req.query.name });
    if (!result.success) {
      res.status(400).json({ error: 'Name parameter is required' });
      return;
    }

    const { name } = result.data;

    // Find all standard sets (dropIndex === 0) belonging to completed sessions.
    const matchingSets = await SetModel.findAll({
      where: {
        dropIndex: 0,
      },
      include: [{
        model: Session,
        as: 'session',
        where: {
          completedAt: { [Op.not]: null },
        },
        attributes: ['id', 'completedAt'],
      }],
      order: [
        [{ model: Session, as: 'session' }, 'completedAt', 'DESC'],
        ['setNumber', 'ASC'],
      ],
    });

    // Filter by name (case-insensitive); SQLite LOWER() through Sequelize is awkward.
    const filtered = matchingSets.filter(
      set => set.exerciseName.toLowerCase() === name.toLowerCase()
    );

    const sets = filtered.map(set => ({
      weight: set.weight,
      reps: set.reps,
      dropIndex: set.dropIndex,
      durationSec: set.durationSec,
      distance: set.distance,
      completedAt: (set as SetWithSession).session.completedAt,
    }));

    res.json({ sets });
  } catch (error) {
    console.error('Error fetching all sets by name:', error);
    res.status(500).json({ error: 'Failed to fetch sets' });
  }
});

// GET /api/exercises/suggestions - Autocomplete suggestions
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query || query.length < 2) {
      res.json([]);
      return;
    }

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
router.get('/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
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
router.post('/', validate(createExerciseSchema), async (req: Request, res: Response) => {
  try {
    const {
      workoutId, name, targetSets, targetReps, orderIndex, supersetGroup,
      exerciseType, cardioModality, targetDurationSec, targetDistance,
    } = req.body;

    const workout = await Workout.findByPk(workoutId);
    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    const exercise = await Exercise.create({
      workoutId,
      name,
      targetSets,
      targetReps,
      orderIndex,
      supersetGroup: supersetGroup || null,
      exerciseType: exerciseType || 'strength',
      cardioModality: cardioModality ?? null,
      targetDurationSec: targetDurationSec ?? null,
      targetDistance: targetDistance ?? null,
    });

    res.status(201).json(exercise);
  } catch (error) {
    console.error('Error creating exercise:', error);
    res.status(500).json({ error: 'Failed to create exercise' });
  }
});

// PUT /api/exercises/:id - Update exercise
router.put('/:id', validateParams(idParamSchema), validate(updateExerciseSchema), async (req: Request, res: Response) => {
  try {
    const exercise = await Exercise.findByPk(Number(req.params.id));
    if (!exercise) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }

    const {
      name, targetSets, targetReps, orderIndex, supersetGroup,
      exerciseType, cardioModality, targetDurationSec, targetDistance,
    } = req.body;
    if (name !== undefined) exercise.name = name;
    if (targetSets !== undefined) exercise.targetSets = targetSets;
    if (targetReps !== undefined) exercise.targetReps = targetReps;
    if (orderIndex !== undefined) exercise.orderIndex = orderIndex;
    if (supersetGroup !== undefined) exercise.supersetGroup = supersetGroup;
    if (exerciseType !== undefined) exercise.exerciseType = exerciseType;
    if (cardioModality !== undefined) exercise.cardioModality = cardioModality;
    if (targetDurationSec !== undefined) exercise.targetDurationSec = targetDurationSec;
    if (targetDistance !== undefined) exercise.targetDistance = targetDistance;

    await exercise.save();
    res.json(exercise);
  } catch (error) {
    console.error('Error updating exercise:', error);
    res.status(500).json({ error: 'Failed to update exercise' });
  }
});

// DELETE /api/exercises/:id - Delete exercise
router.delete('/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const exercise = await Exercise.findByPk(Number(req.params.id));
    if (!exercise) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }

    await exercise.destroy();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting exercise:', error);
    res.status(500).json({ error: 'Failed to delete exercise' });
  }
});

export default router;
