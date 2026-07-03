import { api } from '../../../shared/api/client';
import { epleyOneRepMax } from '../../../shared/lib/oneRepMax';
import type {
  Program,
  Session,
  Set as WorkoutSet,
  StatsResponse,
  ProgramExportPayload,
  ProgramExportWorkout,
  ProgramExportExercise,
} from '../../../shared/api/types';
import type { ChatToolCall, ChatToolDef } from './providers/types';

export interface CoachToolset {
  defs: ChatToolDef[];
  execute: (call: ChatToolCall) => Promise<string>;
  /** Human-readable status while a tool runs (for the "Reading…" indicator). */
  describe: (call: ChatToolCall) => string;
}

const SUPERSET_GROUPS = new Set(['A', 'B', 'C', 'D', 'E']);

// ---------------------------------------------------------------------------
// Data formatting — keep payloads compact so small models stay cheap & on-task
// ---------------------------------------------------------------------------

function isStrengthSet(s: WorkoutSet): boolean {
  return (s.durationSec ?? 0) <= 0 && (s.distance ?? 0) <= 0;
}

function summarizeSession(session: Session) {
  const byExercise = new Map<string, { topWeight: number; topReps: number; sets: number }>();
  for (const set of session.sets ?? []) {
    if (set.dropIndex !== 0) continue;
    const entry = byExercise.get(set.exerciseName) ?? { topWeight: 0, topReps: 0, sets: 0 };
    entry.sets += 1;
    if (set.weight > entry.topWeight) {
      entry.topWeight = set.weight;
      entry.topReps = set.reps;
    }
    byExercise.set(set.exerciseName, entry);
  }
  return {
    date: session.completedAt,
    workout: session.workoutName,
    exercises: [...byExercise.entries()].map(([name, e]) => ({
      name,
      sets: e.sets,
      topSet: `${e.topWeight}lb x ${e.topReps}`,
    })),
  };
}

async function getActiveProgram(): Promise<string> {
  const { data } = await api.get<Program[]>('/programs');
  const active = data.find((p) => p.isActive);
  if (!active) return 'No active program is set.';
  const workouts = (active.workouts ?? [])
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((w, i) => ({
      index: i,
      isNext: i === active.currentWorkoutIndex,
      name: w.name,
      exercises: (w.exercises ?? [])
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((e) => ({
          name: e.name,
          target: `${e.targetSets} x ${e.targetReps}`,
          type: e.exerciseType,
          superset: e.supersetGroup ?? undefined,
        })),
    }));
  return JSON.stringify({
    name: active.name,
    currentWorkoutIndex: active.currentWorkoutIndex,
    note: 'currentWorkoutIndex marks the workout that is up next.',
    workouts,
  });
}

async function listRecentSessions(limit: number): Promise<string> {
  const capped = Math.max(1, Math.min(limit || 10, 30));
  const { data } = await api.get<Session[]>('/sessions/history', { params: { limit: capped } });
  if (data.length === 0) return 'No completed sessions yet.';
  return JSON.stringify(data.map(summarizeSession));
}

async function getExerciseHistory(name: string): Promise<string> {
  if (!name.trim()) return 'Provide an exercise name.';
  const { data } = await api.get<{
    sets: Array<{
      weight: number;
      reps: number;
      dropIndex: number;
      durationSec: number | null;
      distance: number | null;
      completedAt: string | null;
    }>;
  }>('/exercises/all-sets-by-name', { params: { name } });

  const sets = data.sets.filter((s) => s.dropIndex === 0);
  if (sets.length === 0) return `No history found for "${name}".`;

  let best1RM = 0;
  // Best (heaviest) set per session date
  const byDate = new Map<string, { weight: number; reps: number }>();
  for (const s of sets) {
    if (s.weight > 0 && s.reps > 0) {
      best1RM = Math.max(best1RM, epleyOneRepMax(s.weight, s.reps));
    }
    const key = s.completedAt ? s.completedAt.slice(0, 10) : 'unknown';
    const cur = byDate.get(key);
    if (!cur || s.weight > cur.weight) byDate.set(key, { weight: s.weight, reps: s.reps });
  }

  const recent = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 10)
    .map(([date, v]) => ({ date, topSet: `${v.weight}lb x ${v.reps}` }));

  return JSON.stringify({ exercise: name, bestEstimated1RM: best1RM, recentTopSets: recent });
}

async function getStats(): Promise<string> {
  const { data } = await api.get<StatsResponse>('/sessions/stats');
  return JSON.stringify(data);
}

async function getPersonalRecords(): Promise<string> {
  const { data } = await api.get<Session[]>('/sessions/history', { params: { limit: 1000 } });
  const best = new Map<string, { e1rm: number; topWeight: number; topReps: number }>();
  for (const session of data) {
    for (const set of session.sets ?? []) {
      if (set.dropIndex !== 0 || !isStrengthSet(set)) continue;
      if (set.weight <= 0 || set.reps <= 0) continue;
      const e1rm = epleyOneRepMax(set.weight, set.reps);
      const cur = best.get(set.exerciseName);
      if (!cur || e1rm > cur.e1rm) {
        best.set(set.exerciseName, { e1rm, topWeight: set.weight, topReps: set.reps });
      }
    }
  }
  if (best.size === 0) return 'No strength PRs recorded yet.';
  const records = [...best.entries()]
    .sort((a, b) => b[1].e1rm - a[1].e1rm)
    .map(([name, r]) => ({ exercise: name, estimated1RM: r.e1rm, bestSet: `${r.topWeight}lb x ${r.topReps}` }));
  return JSON.stringify(records);
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
  const defs: ChatToolDef[] = [
    {
      name: 'get_active_program',
      description:
        "Call this whenever the user asks about their current plan, today's workout, what's next, or which exercises/sets/reps they should do. Returns the active program with its workouts and the index of the workout that is up next.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_recent_sessions',
      description:
        'Call this to review what the user actually did recently — for "review my week", "how have I been training", progress questions, or before giving a next-workout prescription. Returns completed sessions newest-first with each exercise\'s top set.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'How many recent sessions to return (1-30, default 10).' },
        },
        required: [],
      },
    },
    {
      name: 'get_exercise_history',
      description:
        'Call this when the user asks about a specific lift (e.g. "how is my bench doing", "what should I squat today"). Returns that exercise\'s best estimated 1RM and recent top sets by date.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exercise name, e.g. "Bench Press".' },
        },
        required: ['name'],
      },
    },
    {
      name: 'get_stats',
      description:
        'Call this for summary numbers: total sessions, sessions in the last 30 days, and current week streak.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_personal_records',
      description:
        'Call this when the user asks about PRs, maxes, or their strongest lifts. Returns best estimated 1RM and best set per exercise.',
      parameters: { type: 'object', properties: {}, required: [] },
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
        case 'get_active_program':
          return await getActiveProgram();
        case 'list_recent_sessions':
          return await listRecentSessions(Number(call.input.limit) || 10);
        case 'get_exercise_history':
          return await getExerciseHistory(String(call.input.name ?? ''));
        case 'get_stats':
          return await getStats();
        case 'get_personal_records':
          return await getPersonalRecords();
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
      case 'get_active_program':
        return 'Checking your active program…';
      case 'list_recent_sessions':
        return 'Reading your recent sessions…';
      case 'get_exercise_history':
        return `Looking up ${String(call.input.name ?? 'exercise')} history…`;
      case 'get_stats':
        return 'Pulling your stats…';
      case 'get_personal_records':
        return 'Checking your PRs…';
      case 'propose_program':
        return 'Drafting a workout plan…';
      default:
        return 'Working…';
    }
  }

  return { defs, execute, describe };
}
