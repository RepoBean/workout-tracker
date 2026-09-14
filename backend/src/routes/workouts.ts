import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, now } from '../db/index.js';
import { programs, workouts, exercises } from '../db/schema.js';
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
// Queries
// ============================================

function findWorkoutWithExercises(id: number) {
  return db.query.workouts.findFirst({
    where: eq(workouts.id, id),
    with: { exercises: { orderBy: asc(exercises.orderIndex) } },
  });
}

function findWorkout(id: number) {
  return db.select().from(workouts).where(eq(workouts.id, id)).get();
}

// ============================================
// Routes
// ============================================

// GET /api/workouts/:id - Get single workout with exercises
router.get('/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const workout = await findWorkoutWithExercises(Number(req.params.id));

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
router.post('/', validate(createWorkoutSchema), (req: Request, res: Response) => {
  try {
    const { programId, name, orderIndex } = req.body;

    const program = db.select({ id: programs.id }).from(programs).where(eq(programs.id, programId)).get();
    if (!program) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    const ts = now();
    const workout = db.insert(workouts)
      .values({ programId, name, orderIndex, createdAt: ts, updatedAt: ts })
      .returning().get();
    res.status(201).json(workout);
  } catch (error) {
    console.error('Error creating workout:', error);
    res.status(500).json({ error: 'Failed to create workout' });
  }
});

// PUT /api/workouts/:id - Update workout
router.put('/:id', validateParams(idParamSchema), validate(updateWorkoutSchema), (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!findWorkout(id)) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    const { name, orderIndex } = req.body;
    const workout = db.update(workouts).set({
      ...(name !== undefined && { name }),
      ...(orderIndex !== undefined && { orderIndex }),
      updatedAt: now(),
    }).where(eq(workouts.id, id)).returning().get();

    res.json(workout);
  } catch (error) {
    console.error('Error updating workout:', error);
    res.status(500).json({ error: 'Failed to update workout' });
  }
});

// DELETE /api/workouts/:id - Delete workout (SQLite cascades to exercises, nulls sessions)
router.delete('/:id', validateParams(idParamSchema), (req: Request, res: Response) => {
  try {
    const result = db.delete(workouts).where(eq(workouts.id, Number(req.params.id))).run();
    if (result.changes === 0) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting workout:', error);
    res.status(500).json({ error: 'Failed to delete workout' });
  }
});

// POST /api/workouts/:id/duplicate - Duplicate workout with exercises
router.post('/:id/duplicate', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const original = await findWorkoutWithExercises(Number(req.params.id));

    if (!original) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    const { count } = db.select({ count: sql<number>`count(*)` })
      .from(workouts).where(eq(workouts.programId, original.programId)).get()!;

    const newId = db.transaction((tx) => {
      const ts = now();
      const workout = tx.insert(workouts).values({
        programId: original.programId,
        name: `${original.name} (Copy)`,
        orderIndex: count,
        createdAt: ts,
        updatedAt: ts,
      }).returning({ id: workouts.id }).get();

      for (const e of original.exercises) {
        tx.insert(exercises).values({
          workoutId: workout.id,
          name: e.name,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          orderIndex: e.orderIndex,
          supersetGroup: e.supersetGroup || null,
          exerciseType: e.exerciseType || 'strength',
          cardioModality: e.cardioModality || null,
          targetDurationSec: e.targetDurationSec ?? null,
          targetDistance: e.targetDistance ?? null,
          createdAt: ts,
          updatedAt: ts,
        }).run();
      }

      return workout.id;
    });

    res.status(201).json(await findWorkoutWithExercises(newId));
  } catch (error) {
    console.error('Error duplicating workout:', error);
    res.status(500).json({ error: 'Failed to duplicate workout' });
  }
});

// POST /api/workouts/reorder - Reorder workouts within a program
router.post('/reorder', validate(reorderWorkoutsSchema), (req: Request, res: Response) => {
  try {
    const { workoutIds } = req.body as { workoutIds: number[] };

    db.transaction((tx) => {
      const ts = now();
      workoutIds.forEach((id, i) => {
        tx.update(workouts).set({ orderIndex: i, updatedAt: ts }).where(eq(workouts.id, id)).run();
      });
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering workouts:', error);
    res.status(500).json({ error: 'Failed to reorder workouts' });
  }
});

// POST /api/workouts/:id/reorder-exercises - Reorder exercises within a workout
router.post('/:id/reorder-exercises', validateParams(idParamSchema), validate(reorderExercisesSchema), (req: Request, res: Response) => {
  try {
    const workoutId = Number(req.params.id);
    const { exerciseIds } = req.body as { exerciseIds: number[] };

    if (!findWorkout(workoutId)) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    db.transaction((tx) => {
      const ts = now();
      exerciseIds.forEach((id, i) => {
        tx.update(exercises)
          .set({ orderIndex: i, updatedAt: ts })
          .where(and(eq(exercises.id, id), eq(exercises.workoutId, workoutId)))
          .run();
      });
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering exercises:', error);
    res.status(500).json({ error: 'Failed to reorder exercises' });
  }
});

export default router;
