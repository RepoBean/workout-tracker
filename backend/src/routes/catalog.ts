import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db, now } from '../db/index.js';
import { exerciseCatalog, exercises, sets, MUSCLES } from '../db/schema.js';
import type { CatalogEntry, MuscleTags } from '../db/schema.js';
import { validate, validateParams, idParamSchema } from '../middleware/validate.js';

// The exercise catalog. Rows only ever come from names on Exercises/Sets rows
// (src/db/catalog.ts); this router lists them and lets the user say which ones are
// the same lift. Merge and split move identity (catalogId) only — names on the
// rows, exerciseNotes and every row's updatedAt stay exactly as logged.
// v4 C5: an entry may carry muscle tags (PUT /:id). Merge keeps A's tags, else B's;
// split copies A's onto the split-off entry.

const router = Router();

const mergeSchema = z.object({
  fromId: z.number().int().positive(),
});

const splitSchema = z.object({
  alias: z.string().trim().min(1).max(255),
});

// The vocabulary lives in db/schema.ts (MUSCLES); frontend/src/shared/lib/muscles.ts mirrors it.
const muscleList = z.array(z.enum(MUSCLES)).max(MUSCLES.length)
  .refine((list) => new Set(list).size === list.length, 'Duplicate muscle');

const musclesSchema = z.object({
  muscles: z.object({ primary: muscleList, secondary: muscleList }).strict()
    .refine((m) => !m.primary.some((x) => m.secondary.includes(x)), 'A muscle cannot be both primary and secondary')
    .refine((m) => m.primary.length > 0 || m.secondary.length === 0, 'Secondary muscles need at least one primary')
    .nullable(),
});

const fold = (s: string) => s.trim().toLowerCase();

function findEntry(id: number): CatalogEntry | undefined {
  return db.select().from(exerciseCatalog).where(eq(exerciseCatalog.id, id)).get();
}

/** Entry + how many sets / program exercises point at it — what the Settings card shows. */
function listEntries(id?: number) {
  return db
    .select({
      id: exerciseCatalog.id,
      name: exerciseCatalog.name,
      aliases: exerciseCatalog.aliases,
      muscles: exerciseCatalog.muscles,
      setCount: sql<number>`(SELECT count(*) FROM Sets s WHERE s.catalogId = ExerciseCatalog.id)`,
      exerciseCount: sql<number>`(SELECT count(*) FROM Exercises e WHERE e.catalogId = ExerciseCatalog.id)`,
      createdAt: exerciseCatalog.createdAt,
      updatedAt: exerciseCatalog.updatedAt,
    })
    .from(exerciseCatalog)
    .where(id === undefined ? undefined : eq(exerciseCatalog.id, id))
    .orderBy(sql`lower(${exerciseCatalog.name})`, exerciseCatalog.id)
    .all();
}

/** Is `name` already a catalog name or alias on some row other than `except`? */
function nameTaken(name: string, except: number[]): boolean {
  return db.select().from(exerciseCatalog).all()
    .filter((entry) => !except.includes(entry.id))
    .some((entry) => fold(entry.name) === fold(name) || entry.aliases.some((a) => fold(a) === fold(name)));
}

// GET /api/catalog - Every entry with counts, sorted by name (near-duplicates sit together)
router.get('/', (_req: Request, res: Response) => {
  try {
    res.json(listEntries());
  } catch (error) {
    console.error('Error listing catalog:', error);
    res.status(500).json({ error: 'Failed to list catalog' });
  }
});

// POST /api/catalog/:id/merge { fromId } - Fold entry `fromId` into `:id`
router.post('/:id/merge', validateParams(idParamSchema), validate(mergeSchema), (req: Request, res: Response) => {
  try {
    const intoId = Number(req.params.id);
    const { fromId } = req.body as z.infer<typeof mergeSchema>;
    if (fromId === intoId) {
      res.status(400).json({ error: 'Cannot merge an entry into itself' });
      return;
    }

    const into = findEntry(intoId);
    const from = findEntry(fromId);
    if (!into || !from) {
      res.status(404).json({ error: 'Catalog entry not found' });
      return;
    }

    // A gains B's name and B's aliases (deduped, case-insensitively, against itself)
    const aliases = [...into.aliases];
    for (const name of [from.name, ...from.aliases]) {
      if (fold(name) === fold(into.name) || aliases.some((a) => fold(a) === fold(name))) continue;
      aliases.push(name);
    }
    const clash = aliases.find((a) => nameTaken(a, [intoId, fromId]));
    if (clash) {
      res.status(409).json({ error: `"${clash}" already belongs to another catalog entry` });
      return;
    }

    db.transaction((tx) => {
      tx.update(sets).set({ catalogId: intoId }).where(eq(sets.catalogId, fromId)).run();
      tx.update(exercises).set({ catalogId: intoId }).where(eq(exercises.catalogId, fromId)).run();
      // Tags follow identity: A keeps its own, an untagged A takes B's
      tx.update(exerciseCatalog).set({ aliases, muscles: into.muscles ?? from.muscles, updatedAt: now() })
        .where(eq(exerciseCatalog.id, intoId)).run();
      // Unreferenced now, so the NO ACTION foreign keys allow it
      tx.delete(exerciseCatalog).where(eq(exerciseCatalog.id, fromId)).run();
    });

    res.json(listEntries(intoId)[0]);
  } catch (error) {
    console.error('Error merging catalog entries:', error);
    res.status(500).json({ error: 'Failed to merge catalog entries' });
  }
});

// POST /api/catalog/:id/split { alias } - Undo a merge: the alias becomes its own entry again
router.post('/:id/split', validateParams(idParamSchema), validate(splitSchema), (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { alias } = req.body as z.infer<typeof splitSchema>;

    const entry = findEntry(id);
    if (!entry) {
      res.status(404).json({ error: 'Catalog entry not found' });
      return;
    }
    const stored = entry.aliases.find((a) => fold(a) === fold(alias));
    if (stored === undefined) {
      res.status(404).json({ error: `"${alias}" is not an alias of "${entry.name}"` });
      return;
    }
    if (nameTaken(stored, [id])) {
      res.status(409).json({ error: `"${stored}" already belongs to another catalog entry` });
      return;
    }

    const createdId = db.transaction((tx) => {
      const ts = now();
      tx.update(exerciseCatalog)
        .set({ aliases: entry.aliases.filter((a) => a !== stored), updatedAt: ts })
        .where(eq(exerciseCatalog.id, id)).run();
      const created = tx.insert(exerciseCatalog)
        // Same lift until the user says otherwise: copy A's tags
        .values({ name: stored, aliases: [], muscles: entry.muscles, createdAt: ts, updatedAt: ts })
        .returning({ id: exerciseCatalog.id }).get();
      // Names never left the rows, so the rows that were logged under the alias are exact
      const byName = (column: typeof sets.exerciseName | typeof exercises.name) =>
        sql`lower(trim(${column})) = lower(${stored})`;
      tx.update(sets).set({ catalogId: created.id })
        .where(and(eq(sets.catalogId, id), byName(sets.exerciseName))).run();
      tx.update(exercises).set({ catalogId: created.id })
        .where(and(eq(exercises.catalogId, id), byName(exercises.name))).run();
      return created.id;
    });

    res.status(201).json({ entry: listEntries(id)[0], created: listEntries(createdId)[0] });
  } catch (error) {
    console.error('Error splitting catalog entry:', error);
    res.status(500).json({ error: 'Failed to split catalog entry' });
  }
});

// PUT /api/catalog/:id { muscles: { primary, secondary } | null } - Tag (or untag) a lift.
// Empty lists are stored as NULL so "untagged" has one representation. Bumps only this
// row's updatedAt (the coach memo keys on the catalog fingerprint); no Sets/Exercises row changes.
router.put('/:id', validateParams(idParamSchema), validate(musclesSchema), (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { muscles } = req.body as z.infer<typeof musclesSchema>;
    if (!findEntry(id)) {
      res.status(404).json({ error: 'Catalog entry not found' });
      return;
    }
    const stored: MuscleTags | null = muscles && muscles.primary.length > 0 ? muscles : null;
    db.update(exerciseCatalog).set({ muscles: stored, updatedAt: now() }).where(eq(exerciseCatalog.id, id)).run();
    res.json(listEntries(id)[0]);
  } catch (error) {
    console.error('Error tagging catalog entry:', error);
    res.status(500).json({ error: 'Failed to update catalog entry' });
  }
});

export default router;
