import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { and, asc, eq, ne } from 'drizzle-orm';
import { db, now } from '../db/index.js';
import { bodyWeights } from '../db/schema.js';
import { validate, validateParams, idParamSchema } from '../middleware/validate.js';

// Dated weigh-ins (v4 C3, docs/v4-bundle-c3-bodyweight.md). One row per local calendar
// day; logging a day again overwrites it. Which weigh-in applies to a session is the
// client's call (shared/lib/bodyweight.ts); the server only stores them.

const router = Router();

function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Tomorrow in the server's zone (TZ=America/New_York): one day of slack for a phone elsewhere. */
function latestAllowedDate(): string {
  const d = now();
  return localDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
}

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
  }, 'Not a calendar date')
  .refine((s) => s <= latestAllowedDate(), 'Date is in the future');

// Same range as PROFILE_LIMITS.bodyweight in frontend/src/shared/lib/hrZones.ts.
const weightSchema = z.number().min(50).max(700);

const createSchema = z.object({ date: dateSchema, weight: weightSchema });
const updateSchema = z.object({ date: dateSchema.optional(), weight: weightSchema.optional() })
  .refine((v) => v.date !== undefined || v.weight !== undefined, 'Nothing to update');

// GET /api/bodyweights - Every weigh-in, oldest first
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json(db.select().from(bodyWeights).orderBy(asc(bodyWeights.date)).all());
  } catch (error) {
    console.error('Error fetching weigh-ins:', error);
    res.status(500).json({ error: 'Failed to fetch weigh-ins' });
  }
});

// POST /api/bodyweights { date, weight } - Log a weigh-in; the same day again overwrites it
router.post('/', validate(createSchema), (req: Request, res: Response) => {
  try {
    const { date, weight } = req.body as z.infer<typeof createSchema>;
    const result = db.transaction((tx) => {
      const ts = now();
      const existing = tx.select().from(bodyWeights).where(eq(bodyWeights.date, date)).get();
      if (existing) {
        const row = tx.update(bodyWeights).set({ weight, updatedAt: ts })
          .where(eq(bodyWeights.id, existing.id)).returning().get();
        return { row, created: false };
      }
      const row = tx.insert(bodyWeights).values({ date, weight, createdAt: ts, updatedAt: ts }).returning().get();
      return { row, created: true };
    });
    res.status(result.created ? 201 : 200).json(result.row);
  } catch (error) {
    console.error('Error logging weigh-in:', error);
    res.status(500).json({ error: 'Failed to log weigh-in' });
  }
});

// PUT /api/bodyweights/:id { date?, weight? } - Edit one; moving onto another day's date is a 409
router.put('/:id', validateParams(idParamSchema), validate(updateSchema), (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { date, weight } = req.body as z.infer<typeof updateSchema>;
    const result = db.transaction((tx) => {
      const existing = tx.select().from(bodyWeights).where(eq(bodyWeights.id, id)).get();
      if (!existing) return { status: 404 as const };
      if (date !== undefined) {
        const clash = tx.select({ id: bodyWeights.id }).from(bodyWeights)
          .where(and(eq(bodyWeights.date, date), ne(bodyWeights.id, id))).get();
        if (clash) return { status: 409 as const };
      }
      const row = tx.update(bodyWeights)
        .set({ ...(date !== undefined && { date }), ...(weight !== undefined && { weight }), updatedAt: now() })
        .where(eq(bodyWeights.id, id)).returning().get();
      return { status: 200 as const, row };
    });
    if (result.status === 404) {
      res.status(404).json({ error: 'Weigh-in not found' });
      return;
    }
    if (result.status === 409) {
      res.status(409).json({ error: 'There is already a weigh-in on that date' });
      return;
    }
    res.json(result.row);
  } catch (error) {
    console.error('Error updating weigh-in:', error);
    res.status(500).json({ error: 'Failed to update weigh-in' });
  }
});

// DELETE /api/bodyweights/:id
router.delete('/:id', validateParams(idParamSchema), (req: Request, res: Response) => {
  try {
    const deleted = db.delete(bodyWeights).where(eq(bodyWeights.id, Number(req.params.id))).returning().get();
    if (!deleted) {
      res.status(404).json({ error: 'Weigh-in not found' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    console.error('Error deleting weigh-in:', error);
    res.status(500).json({ error: 'Failed to delete weigh-in' });
  }
});

export default router;
