import { api } from '../../../shared/api/client';
import type {
  Session,
  Set as WorkoutSet,
  ProgramExportPayload,
  ProgramExportWorkout,
  ProgramExportExercise,
} from '../../../shared/api/types';
import { renderSessions } from './dossier';
import type { ChatToolCall, ChatToolDef } from './providers/types';

export interface CoachToolset {
  defs: ChatToolDef[];
  execute: (call: ChatToolCall) => Promise<string>;
  /** Human-readable status while a tool runs (for the "Reading…" indicator). */
  describe: (call: ChatToolCall) => string;
}

const SUPERSET_GROUPS = new Set(['A', 'B', 'C', 'D', 'E']);

// ---------------------------------------------------------------------------
// get_workout_history
//
// The only data tool. Everything a static dossier can hold is already in the system
// prompt; this covers the one thing it structurally cannot — the unbounded tail past
// the 20-session window.
// ---------------------------------------------------------------------------

/** A personal lifetime; the backend clamps limit to [1, 2000]. */
const HISTORY_LIMIT = 2000;
/**
 * Result cap. Nothing in coachLoop.ts or either adapter truncates tool results, so an
 * oversized one surfaces as a raw provider 400. A safety net, not a live constraint:
 * the entire 88-session history renders to ~27k chars.
 */
const MAX_RESULT_CHARS = 40000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !isNaN(Date.parse(`${value}T00:00:00Z`));
}

function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Resolve the requested window to concrete dates.
 *
 * `monthsBack` is the preferred form: the model does no calendar arithmetic, which removes
 * the entire class of "last month" -> garbage-string bugs. A raw unparseable date is an
 * ERROR, never a silent pass-through — the backend compares query strings directly against
 * ISO timestamps, so `?from=garbage` returns zero sessions with a 200, and a model would
 * conclude the user has never trained.
 */
function resolveRange(input: Record<string, unknown>):
  | { ok: true; from?: string; to?: string; label: string }
  | { ok: false; error: string } {
  const monthsBackRaw = input.monthsBack;
  if (monthsBackRaw != null && monthsBackRaw !== '') {
    const months = Number(monthsBackRaw);
    if (!Number.isFinite(months) || months <= 0 || months > 600) {
      return { ok: false, error: `monthsBack must be a positive number of months, got "${String(monthsBackRaw)}".` };
    }
    const now = new Date();
    const start = new Date(now);
    start.setMonth(start.getMonth() - Math.round(months));
    return {
      ok: true,
      from: localIsoDate(start),
      to: localIsoDate(now),
      label: `last ${Math.round(months)} month(s) (${localIsoDate(start)} to ${localIsoDate(now)})`,
    };
  }

  const from = typeof input.from === 'string' && input.from.trim() ? input.from.trim() : undefined;
  const to = typeof input.to === 'string' && input.to.trim() ? input.to.trim() : undefined;

  for (const [name, value] of [['from', from], ['to', to]] as const) {
    if (value && !isValidIsoDate(value)) {
      return {
        ok: false,
        error: `${name}="${value}" is not a valid date. Use YYYY-MM-DD, or pass monthsBack instead (e.g. monthsBack: 3 for the last three months). Do not pass relative phrases.`,
      };
    }
  }

  if (!from && !to) return { ok: true, label: 'all time' };
  return { ok: true, from, to, label: `${from ?? 'the beginning'} to ${to ?? 'today'}` };
}

/**
 * Case-insensitive SUBSTRING match, never exact equality.
 *
 * Lifts get renamed and an exact match silently returns half the history while looking
 * complete: live, "Low Incline Dumbbell Press" (63 sets, Apr-Jun) became "Low Incline DB
 * Press" (44 sets, Jun-Sep). Exact matching on the new name reads as if the lift began in
 * June. The caller reports which names matched so the model can say so.
 */
function matchesExercise(setName: string, query: string): boolean {
  return setName.toLowerCase().includes(query.toLowerCase());
}

async function suggestNames(query: string): Promise<string> {
  try {
    const { data } = await api.get<string[] | { name: string }[]>('/exercises/suggestions', {
      params: { q: query },
    });
    const names = (data as Array<string | { name: string }>)
      .map((d) => (typeof d === 'string' ? d : d?.name))
      .filter(Boolean)
      .slice(0, 10);
    if (names.length === 0) return '';
    return ` Closest names on record: ${names.join(', ')}.`;
  } catch {
    return '';
  }
}

async function getWorkoutHistory(input: Record<string, unknown>): Promise<string> {
  const range = resolveRange(input);
  if (!range.ok) return `Error: ${range.error}`;

  const params: Record<string, string | number> = { limit: HISTORY_LIMIT };
  if (range.from) params.from = range.from;
  // The backend compares raw strings against full ISO timestamps, so a bare YYYY-MM-DD
  // would exclude every session ON the end date.
  if (range.to) params.to = `${range.to}T23:59:59.999Z`;

  const { data } = await api.get<Session[]>('/sessions/history', { params });

  const exerciseName =
    typeof input.exerciseName === 'string' && input.exerciseName.trim()
      ? input.exerciseName.trim()
      : '';

  let sessions = data;
  let matchedNote = '';

  if (exerciseName) {
    const matchedNames = new Set<string>();
    sessions = data
      .map((session) => {
        const sets = (session.sets ?? []).filter((s: WorkoutSet) => {
          const hit = matchesExercise(s.exerciseName, exerciseName);
          if (hit) matchedNames.add(s.exerciseName);
          return hit;
        });
        return { ...session, sets };
      })
      .filter((session) => (session.sets ?? []).length > 0);

    if (sessions.length === 0) {
      const suggestions = await suggestNames(exerciseName);
      return `No sets found for "${exerciseName}" in ${range.label}.${suggestions}`;
    }
    const names = [...matchedNames].sort();
    matchedNote =
      names.length > 1
        ? `Matched ${names.length} exercise names (likely the same lift renamed): ${names.join(', ')}.\n`
        : `Matched exercise: ${names[0]}.\n`;
  }

  if (sessions.length === 0) {
    return `No completed sessions in ${range.label}.`;
  }

  const scope = exerciseName ? `"${exerciseName}"` : 'all exercises';
  const head = `${sessions.length} session(s), ${scope}, ${range.label}, newest first.\n${matchedNote}`;

  // Overflow: keep the newest, drop the oldest, and say so.
  let kept = sessions;
  let body = renderSessions(kept);
  let omitted = 0;
  while (body.length > MAX_RESULT_CHARS && kept.length > 1) {
    const drop = Math.max(1, Math.ceil(kept.length * 0.1));
    kept = kept.slice(0, kept.length - drop);
    omitted += drop;
    body = renderSessions(kept);
  }
  const footer = omitted
    ? `\n[${omitted} older session(s) omitted — narrow the range]`
    : '';

  return `${head}${body}${footer}`;
}

// ---------------------------------------------------------------------------
// propose_program — normalize the model's JSON into a valid import payload
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeExercise(raw: unknown, index: number): ProgramExportExercise | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name) return null;
  const targetSets =
    typeof obj.targetSets === 'number' && obj.targetSets >= 1 ? Math.round(obj.targetSets) : 3;
  const targetReps =
    typeof obj.targetReps === 'string' && obj.targetReps.trim()
      ? obj.targetReps.trim().slice(0, 50)
      : String(obj.targetReps ?? '8-12').slice(0, 50);
  const supersetRaw = typeof obj.supersetGroup === 'string' ? obj.supersetGroup.toUpperCase() : null;
  const supersetGroup = supersetRaw && SUPERSET_GROUPS.has(supersetRaw) ? supersetRaw : null;
  const exerciseType = obj.exerciseType === 'cardio' ? 'cardio' : 'strength';
  return {
    name,
    targetSets,
    targetReps,
    orderIndex: index,
    supersetGroup,
    exerciseType,
    cardioModality: null,
    targetDurationSec: null,
    targetDistance: null,
  };
}

function normalizeWorkout(raw: unknown, index: number): ProgramExportWorkout | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name) return null;
  const exercisesRaw = Array.isArray(obj.exercises) ? obj.exercises : [];
  const exercises = exercisesRaw
    .map((e, i) => normalizeExercise(e, i))
    .filter((e): e is ProgramExportExercise => e !== null);
  if (exercises.length === 0) return null;
  return { name, orderIndex: index, exercises };
}

function normalizeProgram(input: Record<string, unknown>): ProgramExportPayload | null {
  // Accept either { program: {...} } or the program object directly.
  const programObj = asRecord(input.program) ?? input;
  const name = typeof programObj.name === 'string' ? programObj.name.trim() : '';
  if (!name) return null;
  const workoutsRaw = Array.isArray(programObj.workouts) ? programObj.workouts : [];
  const workouts = workoutsRaw
    .map((w, i) => normalizeWorkout(w, i))
    .filter((w): w is ProgramExportWorkout => w !== null);
  if (workouts.length === 0) return null;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    program: { name, workouts },
  };
}

// ---------------------------------------------------------------------------
// Toolset factory
// ---------------------------------------------------------------------------

export function createCoachToolset(opts: {
  onProposeProgram: (payload: ProgramExportPayload) => void;
}): CoachToolset {
  // Two tools, down from six. The active program, stats, PRs, per-exercise all-time numbers
  // and the last 20 sessions are all preloaded in the system prompt — keeping tools for them
  // just invites the model to spend a round trip re-fetching what it already has, and every
  // tool definition costs ~1,000 tokens on EVERY request.
  const defs: ChatToolDef[] = [
    {
      name: 'get_workout_history',
      description:
        'Fetch raw session history beyond what is already in your dossier. The dossier already contains the active program, all-time per-exercise numbers, every note, and the last 20 sessions in full — do NOT call this for anything answerable from those. Call it when the user asks about a period or a lift that reaches further back: "my progress over the last 3 months", "compare June vs August", "every set of bench I have ever done". Prefer monthsBack over computing dates yourself. Returns sessions newest-first with full per-set detail.',
      parameters: {
        type: 'object',
        properties: {
          monthsBack: {
            type: 'number',
            description:
              'Preferred. How many months back from today, e.g. 3 for "the last 3 months". Do not also pass from/to.',
          },
          from: {
            type: 'string',
            description:
              'Start date as YYYY-MM-DD. Only use for an explicit calendar range. Never pass a relative phrase like "last month".',
          },
          to: { type: 'string', description: 'End date as YYYY-MM-DD, inclusive.' },
          exerciseName: {
            type: 'string',
            description:
              'Optional. Filter to one lift. Matched as a case-insensitive substring, so "incline press" catches renamed variants; the result names every variant it matched.',
          },
        },
        required: [],
      },
    },
    {
      name: 'propose_program',
      description:
        'Call this ONLY when the user wants a runnable plan — either a full multi-day program or a single-day workout they can start now (a one-day plan is just a program with one workout). Provide the complete program; it is shown to the user for review and import. Do not call this for plain advice.',
      parameters: {
        type: 'object',
        properties: {
          program: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Program name.' },
              workouts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Workout/day name, e.g. "Push A".' },
                    exercises: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          targetSets: { type: 'number' },
                          targetReps: { type: 'string', description: 'e.g. "8-12" or "5".' },
                          supersetGroup: {
                            type: 'string',
                            description: 'Optional A-E to group supersets.',
                          },
                        },
                        required: ['name', 'targetSets', 'targetReps'],
                      },
                    },
                  },
                  required: ['name', 'exercises'],
                },
              },
            },
            required: ['name', 'workouts'],
          },
        },
        required: ['program'],
      },
    },
  ];

  async function execute(call: ChatToolCall): Promise<string> {
    try {
      switch (call.name) {
        case 'get_workout_history':
          return await getWorkoutHistory(call.input);
        case 'propose_program': {
          const payload = normalizeProgram(call.input);
          if (!payload) {
            return 'The program was malformed. It needs a name and at least one workout, each with at least one named exercise. Please retry with a complete structure.';
          }
          opts.onProposeProgram(payload);
          const total = payload.program.workouts.reduce((n, w) => n + w.exercises.length, 0);
          return `Shown "${payload.program.name}" (${payload.program.workouts.length} workout(s), ${total} exercise(s)) to the user for review. Tell them to tap Import to add it, then start it from Quick Workout.`;
        }
        default:
          return `Unknown tool: ${call.name}`;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      return `Tool ${call.name} failed: ${message}`;
    }
  }

  function describe(call: ChatToolCall): string {
    switch (call.name) {
      case 'get_workout_history': {
        const name = call.input.exerciseName;
        if (typeof name === 'string' && name.trim()) return `Looking up ${name.trim()} history…`;
        const months = call.input.monthsBack;
        if (months) return `Reading the last ${months} months…`;
        return 'Reading your history…';
      }
      case 'propose_program':
        return 'Drafting a workout plan…';
      default:
        return 'Working…';
    }
  }

  return { defs, execute, describe };
}
