import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asc, desc, eq } from 'drizzle-orm';
import { db, now } from '../db/index.js';
import { programs, workouts, exercises } from '../db/schema.js';
import { validate, validateParams, idParamSchema } from '../middleware/validate.js';

const router = Router();

// ============================================
// Zod Schemas
// ============================================

const createProgramSchema = z.object({
  name: z.string().min(1).max(255),
});

// isActive is deliberately not updatable here — /set-active is the only
// path that changes it, preserving the single-active-program invariant.
const updateProgramSchema = z.object({
  name: z.string().min(1).max(255).optional(),
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
  exerciseType: z.enum(['strength', 'cardio']).optional().default('strength'),
  cardioModality: z.enum(['running', 'cycling', 'treadmill', 'rowing', 'other']).nullable().optional().default(null),
  targetDurationSec: z.number().int().min(1).nullable().optional().default(null),
  targetDistance: z.number().min(0).nullable().optional().default(null),
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

type ImportProgram = z.infer<typeof importProgramSchema>['program'];

class NotFoundError extends Error {}

// ============================================
// Queries
// ============================================

// Program → workouts (by orderIndex) → exercises (by orderIndex)
const tree = {
  workouts: {
    orderBy: asc(workouts.orderIndex),
    with: { exercises: { orderBy: asc(exercises.orderIndex) } },
  },
} as const;

function findProgramTree(id: number) {
  return db.query.programs.findFirst({ where: eq(programs.id, id), with: tree });
}

function findProgram(id: number) {
  return db.select().from(programs).where(eq(programs.id, id)).get();
}

/** Insert a program plus nested workouts/exercises in one transaction; returns the new id. */
function insertProgramTree(name: string, source: ImportProgram['workouts']): number {
  return db.transaction((tx) => {
    const ts = now();
    const program = tx.insert(programs).values({
      name,
      isActive: false,
      isArchived: false,
      currentWorkoutIndex: 0,
      createdAt: ts,
      updatedAt: ts,
    }).returning({ id: programs.id }).get();

    for (const w of source) {
      const workout = tx.insert(workouts).values({
        programId: program.id,
        name: w.name,
        orderIndex: w.orderIndex,
        createdAt: ts,
        updatedAt: ts,
      }).returning({ id: workouts.id }).get();

      for (const e of w.exercises) {
        tx.insert(exercises).values({
          workoutId: workout.id,
          name: e.name,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          orderIndex: e.orderIndex,
          supersetGroup: e.supersetGroup || null,
          exerciseType: e.exerciseType || 'strength',
          cardioModality: e.cardioModality ?? null,
          targetDurationSec: e.targetDurationSec ?? null,
          targetDistance: e.targetDistance ?? null,
          createdAt: ts,
          updatedAt: ts,
        }).run();
      }
    }

    return program.id;
  });
}

// ============================================
// Routes
// ============================================

// GET /api/programs - List all non-archived programs
router.get('/', async (req: Request, res: Response) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';

    const rows = await db.query.programs.findMany({
      where: includeArchived ? undefined : eq(programs.isArchived, false),
      orderBy: [desc(programs.isActive), asc(programs.name)],
      with: tree,
    });
    res.json(rows);
  } catch (error) {
    console.error('Error fetching programs:', error);
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

// GET /api/programs/:id - Get single program with workouts and exercises
router.get('/:id', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const program = await findProgramTree(Number(req.params.id));

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
router.get('/:id/export', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const program = await findProgramTree(Number(req.params.id));

    if (!program) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      program: {
        name: program.name,
        workouts: program.workouts.map((w) => ({
          name: w.name,
          orderIndex: w.orderIndex,
          exercises: w.exercises.map((e) => ({
            name: e.name,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            orderIndex: e.orderIndex,
            supersetGroup: e.supersetGroup || null,
            exerciseType: e.exerciseType || 'strength',
            cardioModality: e.cardioModality || null,
            targetDurationSec: e.targetDurationSec ?? null,
            targetDistance: e.targetDistance ?? null,
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
router.post('/', validate(createProgramSchema), (req: Request, res: Response) => {
  try {
    const ts = now();
    const program = db.insert(programs).values({
      name: req.body.name,
      createdAt: ts,
      updatedAt: ts,
    }).returning().get();
    res.status(201).json(program);
  } catch (error) {
    console.error('Error creating program:', error);
    res.status(500).json({ error: 'Failed to create program' });
  }
});

// POST /api/programs/import - Import program from JSON
router.post('/import', validate(importProgramSchema), async (req: Request, res: Response) => {
  try {
    const data = req.body as z.infer<typeof importProgramSchema>;
    const id = insertProgramTree(data.program.name, data.program.workouts);
    res.status(201).json(await findProgramTree(id));
  } catch (error) {
    console.error('Error importing program:', error);
    res.status(500).json({ error: 'Failed to import program' });
  }
});

// PUT /api/programs/:id - Update program
router.put('/:id', validateParams(idParamSchema), validate(updateProgramSchema), (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!findProgram(id)) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    const { name, isArchived, currentWorkoutIndex } = req.body;
    const program = db.update(programs).set({
      ...(name !== undefined && { name }),
      ...(isArchived !== undefined && { isArchived }),
      ...(currentWorkoutIndex !== undefined && { currentWorkoutIndex }),
      updatedAt: now(),
    }).where(eq(programs.id, id)).returning().get();

    res.json(program);
  } catch (error) {
    console.error('Error updating program:', error);
    res.status(500).json({ error: 'Failed to update program' });
  }
});

// PUT /api/programs/:id/set-active - Set program as active
router.put('/:id/set-active', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const programId = Number(req.params.id);

    // Throwing inside the transaction rolls it back (the deactivate-all must not stick)
    db.transaction((tx) => {
      const ts = now();
      // Deactivate all programs
      tx.update(programs).set({ isActive: false, updatedAt: ts }).run();

      // Activate target program (and unarchive if needed)
      const result = tx.update(programs)
        .set({ isActive: true, isArchived: false, updatedAt: ts })
        .where(eq(programs.id, programId))
        .run();

      if (result.changes === 0) {
        throw new NotFoundError();
      }
    });

    res.json(await findProgramTree(programId));
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }
    console.error('Error activating program:', error);
    res.status(500).json({ error: 'Failed to activate program' });
  }
});

// POST /api/programs/:id/duplicate - Duplicate program with workouts and exercises
router.post('/:id/duplicate', validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const original = await findProgramTree(Number(req.params.id));

    if (!original) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    const id = insertProgramTree(`${original.name} (Copy)`, original.workouts);
    res.status(201).json(await findProgramTree(id));
  } catch (error) {
    console.error('Error duplicating program:', error);
    res.status(500).json({ error: 'Failed to duplicate program' });
  }
});

// DELETE /api/programs/:id - Archive program (soft delete)
router.delete('/:id', validateParams(idParamSchema), (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const result = db.update(programs)
      .set({ isArchived: true, isActive: false, updatedAt: now() })
      .where(eq(programs.id, id))
      .run();

    if (result.changes === 0) {
      res.status(404).json({ error: 'Program not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error archiving program:', error);
    res.status(500).json({ error: 'Failed to archive program' });
  }
});

export default router;
