/**
 * propose_program_edit: diff the coach's proposed workouts against the active program.
 *
 * The model sends, for each workout it wants to change, that workout's COMPLETE new exercise
 * list. Workouts it doesn't list are left alone (never deleted); a listed name that matches no
 * workout is a new workout. Exercises match by name within the workout (case-insensitive, in
 * order for duplicates). Pure: the coach never writes — the user's Apply runs `applySteps`
 * through the ordinary program endpoints (hooks/useApplyProgramEdit.ts).
 */
import type { Exercise, Program, Workout } from '../../../shared/api/types';

export interface EditExerciseInput {
  name: string;
  targetSets: number;
  targetReps: string;
  supersetGroup: string | null;
  /** undefined = keep the slot's current step; null = clear it (use the global setting). */
  incrementLbs?: number | null;
}

export interface EditWorkoutInput {
  name: string;
  exercises: EditExerciseInput[];
}

export interface ExerciseUpdate {
  exercise: Exercise;
  next: { targetSets: number; targetReps: string; supersetGroup: string | null; incrementLbs: number | null };
  /** Human-readable field changes, e.g. "3 × 10-15 → 3 × 8-12". */
  changes: string[];
}

export interface WorkoutPlan {
  /** null = a new workout. */
  workout: Workout | null;
  name: string;
  removes: Exercise[];
  updates: ExerciseUpdate[];
  adds: EditExerciseInput[];
  /** Final order: an existing exercise id, or an index into `adds`. */
  order: Array<{ id: number } | { add: number }>;
  /** True when the final order differs from "kept exercises in their order, then adds". */
  reordered: boolean;
}

export interface ProgramEditPlan {
  programId: number;
  programName: string;
  workouts: WorkoutPlan[];
}

const key = (name: string) => name.trim().toLowerCase();
const target = (sets: number, reps: string) => `${sets} × ${reps}`;
const step = (v: number | null) => (v == null ? 'default step' : `+${v} lb steps`);

function diffExercise(existing: Exercise, input: EditExerciseInput): ExerciseUpdate | null {
  // Cardio slots keep their cardio fields; the coach can only remove or move them.
  if (existing.exerciseType === 'cardio') return null;
  const currentStep = existing.incrementLbs ?? null;
  const next = {
    targetSets: input.targetSets,
    targetReps: input.targetReps,
    supersetGroup: input.supersetGroup,
    incrementLbs: input.incrementLbs === undefined ? currentStep : input.incrementLbs,
  };
  const changes: string[] = [];
  if (next.targetSets !== existing.targetSets || next.targetReps !== existing.targetReps) {
    changes.push(`${target(existing.targetSets, existing.targetReps)} → ${target(next.targetSets, next.targetReps)}`);
  }
  if ((existing.supersetGroup ?? null) !== next.supersetGroup) {
    changes.push(next.supersetGroup ? `superset ${next.supersetGroup}` : 'no superset');
  }
  if (currentStep !== next.incrementLbs) changes.push(step(next.incrementLbs));
  return changes.length ? { exercise: existing, next, changes } : null;
}

function planWorkout(workout: Workout | null, input: EditWorkoutInput): WorkoutPlan {
  const existing = [...(workout?.exercises ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
  const matched = new Set<number>();
  const updates: ExerciseUpdate[] = [];
  const adds: EditExerciseInput[] = [];
  const order: WorkoutPlan['order'] = [];

  for (const e of input.exercises) {
    const hit = existing.find((x) => !matched.has(x.id) && key(x.name) === key(e.name));
    if (hit) {
      matched.add(hit.id);
      order.push({ id: hit.id });
      const u = diffExercise(hit, e);
      if (u) updates.push(u);
    } else {
      order.push({ add: adds.length });
      adds.push(e);
    }
  }
  const removes = existing.filter((x) => !matched.has(x.id));

  // Without a reorder the server leaves kept exercises in their old relative order and
  // appends the adds; anything else needs the reorder call.
  const kept = existing.filter((x) => matched.has(x.id)).map((x) => ({ id: x.id }));
  const natural = [...kept, ...adds.map((_, i) => ({ add: i }))];
  const same = (a: WorkoutPlan['order'][number], b: WorkoutPlan['order'][number]) =>
    'id' in a && 'id' in b ? a.id === b.id : 'add' in a && 'add' in b ? a.add === b.add : false;
  const reordered = workout !== null && order.some((o, i) => !same(o, natural[i]));

  return { workout, name: workout?.name ?? input.name.trim(), removes, updates, adds, order, reordered };
}

export function isEmptyPlan(w: WorkoutPlan): boolean {
  return w.workout !== null && !w.removes.length && !w.updates.length && !w.adds.length && !w.reordered;
}

/** Number of write steps Apply will make (for "Applied N of M"). */
export function stepCount(plan: ProgramEditPlan): number {
  return plan.workouts.reduce(
    (n, w) => n + (w.workout ? 0 : 1) + w.removes.length + w.updates.length + w.adds.length + (w.reordered ? 1 : 0),
    0,
  );
}

export function planProgramEdit(
  programs: Program[],
  input: EditWorkoutInput[],
): { plan: ProgramEditPlan } | { error: string } {
  const active = programs.find((p) => p.isActive && !p.isArchived);
  if (!active) return { error: 'There is no active program to edit. Use propose_program to build a new one.' };
  if (input.length === 0) return { error: 'No workouts were given. List each workout you want to change with its complete exercise list.' };

  const used = new Set<number>();
  const workouts: WorkoutPlan[] = [];
  for (const w of input) {
    if (w.exercises.length === 0) {
      return { error: `"${w.name}" has no exercises. Removing a whole workout is not supported; list its full new exercise list instead.` };
    }
    const hit = (active.workouts ?? []).find((x) => !used.has(x.id) && key(x.name) === key(w.name)) ?? null;
    if (hit) used.add(hit.id);
    workouts.push(planWorkout(hit, w));
  }
  const changed = workouts.filter((w) => !isEmptyPlan(w));
  if (changed.length === 0) return { error: 'That matches the current program exactly — nothing would change.' };
  return { plan: { programId: active.id, programName: active.name, workouts: changed } };
}

/** One line per change, for the tool result the model sees. */
export function describePlan(plan: ProgramEditPlan): string {
  const lines = [`Edit to "${plan.programName}":`];
  for (const w of plan.workouts) {
    lines.push(`  ${w.workout ? w.name : `${w.name} (new workout)`}:`);
    for (const a of w.adds) lines.push(`    + ${a.name} ${target(a.targetSets, a.targetReps)}`);
    for (const r of w.removes) lines.push(`    − ${r.name}`);
    for (const u of w.updates) lines.push(`    ${u.exercise.name}: ${u.changes.join(', ')}`);
    if (w.reordered) lines.push('    order changed');
  }
  return lines.join('\n');
}
