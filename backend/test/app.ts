import express from 'express';
import { and, eq } from 'drizzle-orm';
import { db, sqlite } from '../src/db/index.js';
import { bootstrap } from '../src/db/migrate.js';
import {
  programs, workouts, exercises, sessions,
  type Program, type Workout, type Exercise, type Session,
  type NewProgram, type NewWorkout, type NewExercise, type NewSession,
} from '../src/db/schema.js';
import programsRouter from '../src/routes/programs.js';
import workoutsRouter from '../src/routes/workouts.js';
import exercisesRouter from '../src/routes/exercises.js';
import sessionsRouter from '../src/routes/sessions.js';

if (process.env.DB_PATH !== ':memory:') {
  throw new Error('Tests must run against an in-memory database (see test/setup.ts)');
}

// Create the schema once per test file (each file gets its own in-memory DB).
bootstrap(sqlite);

export function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/programs', programsRouter);
  app.use('/api/workouts', workoutsRouter);
  app.use('/api/exercises', exercisesRouter);
  app.use('/api/sessions', sessionsRouter);
  return app;
}

/** Empty every table and reset autoincrement — call in beforeEach for a clean slate. */
export async function resetDb() {
  sqlite.pragma('foreign_keys = OFF');
  for (const table of ['Sets', 'Sessions', 'Exercises', 'Workouts', 'Programs']) {
    sqlite.exec(`DELETE FROM "${table}"`);
  }
  sqlite.exec('DELETE FROM sqlite_sequence');
  sqlite.pragma('foreign_keys = ON');
}

// ---- Response types (what the API returns; mirrors the old association types) ----

export type WorkoutWithExercises = Workout & { exercises: Exercise[] };
export type ProgramWithWorkoutsAndExercises = Program & { workouts: WorkoutWithExercises[] };

// ---- Seed helpers ----
// Rows come back with a reload() that refreshes the object in place, so tests
// can assert on a seeded row after the API has changed it.

type Live<T> = T & { reload(): Promise<void> };

function live<T extends { id: number }>(row: T, refetch: (id: number) => T | undefined): Live<T> {
  const obj = row as Live<T>;
  obj.reload = async () => {
    Object.assign(obj, refetch(row.id));
  };
  return obj;
}

const stamped = <T extends object>(values: T) => {
  const ts = new Date();
  return { createdAt: ts, updatedAt: ts, ...values };
};

export const seed = {
  program(values: Omit<NewProgram, 'createdAt' | 'updatedAt'>): Live<Program> {
    const row = db.insert(programs).values(stamped(values)).returning().get();
    return live(row, find.program);
  },
  workout(values: Omit<NewWorkout, 'createdAt' | 'updatedAt'>): Live<Workout> {
    const row = db.insert(workouts).values(stamped(values)).returning().get();
    return live(row, find.workout);
  },
  exercise(values: Omit<NewExercise, 'createdAt' | 'updatedAt'>): Live<Exercise> {
    const row = db.insert(exercises).values(stamped(values)).returning().get();
    return live(row, find.exercise);
  },
  sessions(rows: Array<Omit<NewSession, 'createdAt' | 'updatedAt'>>): void {
    if (rows.length === 0) return;
    db.insert(sessions).values(rows.map(stamped)).run();
  },
};

export const find = {
  program: (id: number) => db.select().from(programs).where(eq(programs.id, id)).get(),
  workout: (id: number) => db.select().from(workouts).where(eq(workouts.id, id)).get(),
  exercise: (id: number) => db.select().from(exercises).where(eq(exercises.id, id)).get(),
  session: (id: number): Session | undefined => db.select().from(sessions).where(eq(sessions.id, id)).get(),
  exerciseInWorkout: (workoutId: number) =>
    db.select().from(exercises).where(and(eq(exercises.workoutId, workoutId))).get(),
};
