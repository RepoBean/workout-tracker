import express, { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, now } from '../db/index.js';
import { settings } from '../db/schema.js';
import { validate, validateParams } from '../middleware/validate.js';

// Per-instance settings shared by the phone and the browser (v4 C2,
// docs/v4-bundle-c2-settings.md). The client keeps localStorage as its synchronous
// cache and applies its own defaults; the server stores what it is sent, nothing more.
//
// aiCoach.apiKey is stored in plain text (VPN-only, one user per instance). This GET
// is the only place it is served: never add settings to exports, the CSV, logs or
// scripts/api-snapshot.sh.

const router = Router();

// The coach thread runs to ~300 KB worst case (40 messages, replies up to 4,096
// tokens). index.ts mounts this router ahead of the global 100 KB parser.
export const settingsJsonParser = express.json({ limit: '1mb' });

const SETTING_KEYS = ['profile', 'progression', 'aiCoach', 'coachThread'] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

const nullableNumber = (min: number, max: number) => z.number().min(min).max(max).nullable();

// Ranges mirror PROFILE_LIMITS in frontend/src/shared/lib/hrZones.ts. bodyweight is
// deliberately absent (stays per device until C3's BodyWeights), so it is stripped.
const valueSchemas: Record<SettingKey, z.ZodTypeAny> = {
  profile: z.object({
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    sex: z.enum(['male', 'female', 'unspecified']),
    restingHr: nullableNumber(30, 100),
    maxHrOverride: nullableNumber(100, 220),
  }),
  progression: z.object({
    enabled: z.boolean(),
    incrementLbs: z.number().positive().max(100),
  }),
  aiCoach: z.object({
    enabled: z.boolean(),
    provider: z.enum(['anthropic', 'openai', 'openrouter', 'google', 'custom']),
    apiKey: z.string().max(1000),
    model: z.string().max(200),
    baseUrl: z.string().max(500),
  }),
  coachThread: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(100_000),
    error: z.literal(true).optional(),
  })).max(40),
};

const keyParamSchema = z.object({ key: z.enum(SETTING_KEYS) });

const putSchema = z.object({
  value: z.unknown(),
  // The updatedAt the client last read; null = "I expect no row". Required for the
  // coach thread (two devices appending to one chat), ignored elsewhere (last write wins).
  baseUpdatedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

type Stored = { value: unknown; updatedAt: Date };

// GET /api/settings - Every key; null for a key never stored (the client applies defaults)
router.get('/', (_req: Request, res: Response) => {
  try {
    const rows = db.select().from(settings).all();
    const out: Record<string, Stored | null> = Object.fromEntries(SETTING_KEYS.map((k) => [k, null]));
    for (const row of rows) {
      if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
        out[row.key] = { value: row.value, updatedAt: row.updatedAt };
      }
    }
    res.json(out);
  } catch (error) {
    console.error('Error reading settings:', error);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// PUT /api/settings/:key { value, baseUpdatedAt? } - Store one key
router.put('/:key', validateParams(keyParamSchema), validate(putSchema), (req: Request, res: Response) => {
  try {
    const key = req.params.key as SettingKey;
    const { value: raw, baseUpdatedAt } = req.body as z.infer<typeof putSchema>;

    const parsed = valueSchemas[key].safeParse(raw);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors.map((e) => ({ path: ['value', ...e.path].join('.'), message: e.message })),
      });
      return;
    }

    if (key === 'coachThread' && baseUpdatedAt === undefined) {
      res.status(400).json({ error: 'baseUpdatedAt is required for coachThread' });
      return;
    }

    const result = db.transaction((tx) => {
      const current = tx.select().from(settings).where(eq(settings.key, key)).get();
      if (key === 'coachThread') {
        const expected = baseUpdatedAt ? Date.parse(baseUpdatedAt) : null;
        const actual = current ? current.updatedAt.getTime() : null;
        if (expected !== actual) {
          return { conflict: current ? { value: current.value, updatedAt: current.updatedAt } : null };
        }
      }
      const ts = now();
      tx.insert(settings)
        .values({ key, value: parsed.data, createdAt: ts, updatedAt: ts })
        .onConflictDoUpdate({ target: settings.key, set: { value: parsed.data, updatedAt: ts } })
        .run();
      return { stored: { value: parsed.data, updatedAt: ts } };
    });

    if ('conflict' in result) {
      res.status(409).json({ error: 'Changed on another device', current: result.conflict });
      return;
    }
    res.json(result.stored);
  } catch (error) {
    console.error('Error saving setting:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

export default router;
