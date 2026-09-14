import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asc, eq, like } from 'drizzle-orm';
import { db, now } from '../db/index.js';
import { exercises, sets, workouts } from '../db/schema.js';
import { allStandardSetsByName, latestSetsByName } from '../db/queries/setsByName.js';
import { validate, validateParams, idParamSchema } from '../middleware/validate.js';

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

const nameQuerySchema = z.object({
  name: z.string().min(1),
});

// ============================================
// Routes
// ============================================

// GET /api/exercises/history-by-name - Most recent completed session's sets for an exercise name
router.get('/history-by-name', (req: Request, res: Response) => {
  try {
    const result = nameQuerySchema.safeParse({ name: req.query.name });
    if (!result.success) {
      res.status(400).json({ error: 'Name parameter is required' });
      return;
    }

    const latest = latestSetsByName(result.data.name);
    if (!latest) {
      res.json({ sets: [], fromSessionDate: null });
      return;
    }

    res.json({
      sets: latest.sets,
      fromSessionDate: latest.completedAt,
    });
  } catch (error) {
    console.error('Error fetching exercise history by name:', error);
    res.status(500).json({ error: 'Failed to fetch exercise history' });
  }
});

// GET /api/exercises/all-sets-by-name - All standard sets for an exercise across all completed sessions
router.get('/all-sets-by-name', (req: Request, res: Response) => {
  try {
    const result = nameQuerySchema.safeParse({ name: req.query.name });
    if (!result.success) {
      res.status(400).json({ error: 'Name parameter is required' });
      return;
    }

    res.json({ sets: allStandardSetsByName(result.data.name) });
  } catch (error) {
    console.error('Error fetching all sets by name:', error);
    res.status(500).json({ error: 'Failed to fetch sets' });
  }
});

// GET /api/exercises/suggestions - Autocomplete suggestions
router.get('/suggestions', (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query || query.length < 2) {
      res.json([]);
      return;
    }

    // Alphabetical per source (what the old GROUP BY returned), program names first
    const exerciseNames = db.selectDistinct({ name: exercises.name })
      .from(exercises)
      .where(like(exercises.name, `%${query}%`))
      .orderBy(asc(exercises.name))
      .limit(10)
      .all();

    const setExerciseNames = db.selectDistinct({ name: sets.exerciseName })
      .from(sets)
      .where(like(sets.exerciseName, `%${query}%`))
      .orderBy(asc(sets.exerciseName))
      .limit(10)
      .all();

    const allNames = new globalThis.Set([
      ...exerciseNames.map(e => e.name),
      ...setExerciseNames.map(s => s.name),
    ]);

    res.json(Array.from(allNames).slice(0, 10));
  } catch (error) {
    console.error('Error fetching exercise suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// GET /api/exercises/:id - Get single exercise
router.get('/:id', validateParams(idParamSchema), (req: Request, res: Response) => {
  try {
    const exercise = db.select().from(exercises).where(eq(exercises.id, Number(req.params.id))).get();

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
router.post('/', validate(createExerciseSchema), (req: Request, res: Response) => {
  try {
    const {
      workoutId, name, targetSets, targetReps, orderIndex, supersetGroup,
      exerciseType, cardioModality, targetDurationSec, targetDistance,
    } = req.body;

    const workout = db.select({ id: workouts.id }).from(workouts).where(eq(workouts.id, workoutId)).get();
    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    const ts = now();
    const exercise = db.insert(exercises).values({
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
      createdAt: ts,
      updatedAt: ts,
    }).returning().get();

    res.status(201).json(exercise);
  } catch (error) {
    console.error('Error creating exercise:', error);
    res.status(500).json({ error: 'Failed to create exercise' });
  }
});

// PUT /api/exercises/:id - Update exercise
router.put('/:id', validateParams(idParamSchema), validate(updateExerciseSchema), (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, id)).get();
    if (!existing) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }

    const {
      name, targetSets, targetReps, orderIndex, supersetGroup,
      exerciseType, cardioModality, targetDurationSec, targetDistance,
    } = req.body;

    const exercise = db.update(exercises).set({
      ...(name !== undefined && { name }),
      ...(targetSets !== undefined && { targetSets }),
      ...(targetReps !== undefined && { targetReps }),
      ...(orderIndex !== undefined && { orderIndex }),
      ...(supersetGroup !== undefined && { supersetGroup }),
      ...(exerciseType !== undefined && { exerciseType }),
      ...(cardioModality !== undefined && { cardioModality }),
      ...(targetDurationSec !== undefined && { targetDurationSec }),
      ...(targetDistance !== undefined && { targetDistance }),
      updatedAt: now(),
    }).where(eq(exercises.id, id)).returning().get();

    res.json(exercise);
  } catch (error) {
    console.error('Error updating exercise:', error);
    res.status(500).json({ error: 'Failed to update exercise' });
  }
});

// DELETE /api/exercises/:id - Delete exercise (SQLite nulls exerciseId on its sets)
router.delete('/:id', validateParams(idParamSchema), (req: Request, res: Response) => {
  try {
    const result = db.delete(exercises).where(eq(exercises.id, Number(req.params.id))).run();
    if (result.changes === 0) {
      res.status(404).json({ error: 'Exercise not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting exercise:', error);
    res.status(500).json({ error: 'Failed to delete exercise' });
  }
});

export default router;
