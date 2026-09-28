// The five original tables mirror the live Sequelize-created schema exactly: same
// table names, column names, defaults, foreign-key actions, and index names.
// Existing databases are used as-is (see migrate.ts); do not rename anything
// here without a migration. ExerciseCatalog (v3 Bundle 2) is the sixth.
import { relations, sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sequelizeDate } from './columns.js';

export type ExerciseType = 'strength' | 'cardio';
export type CardioModality = 'running' | 'cycling' | 'treadmill' | 'rowing' | 'other';
export type SupersetGroup = 'A' | 'B' | 'C' | 'D' | 'E';

const timestamps = {
  createdAt: sequelizeDate('createdAt').notNull(),
  updatedAt: sequelizeDate('updatedAt').notNull(),
};

// One row per distinct lift. Names stay on every Exercises/Sets row (history
// independence); catalogId is derived from them (src/db/catalog.ts) and is what
// Progress, hints, PRs and the coach group by. The case-insensitive unique index
// on name is an expression index, so it lives in migration 0003, not here.
export const exerciseCatalog = sqliteTable('ExerciseCatalog', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  ...timestamps,
});

// No ON DELETE action on purpose (SQLite's NO ACTION): a catalog row history
// points at cannot be deleted. drizzle-kit's ADD COLUMN drops actions anyway.
const catalogRef = () => integer('catalogId').references((): AnySQLiteColumn => exerciseCatalog.id);

export const programs = sqliteTable('Programs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  isActive: integer('isActive', { mode: 'boolean' }).notNull().default(false),
  isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
  currentWorkoutIndex: integer('currentWorkoutIndex').notNull().default(0),
  ...timestamps,
}, (t) => [
  index('programs_is_active').on(t.isActive),
  index('programs_is_archived').on(t.isArchived),
]);

export const workouts = sqliteTable('Workouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  programId: integer('programId').notNull()
    .references(() => programs.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  orderIndex: integer('orderIndex').notNull(),
  ...timestamps,
}, (t) => [
  index('workouts_program_id_order_index').on(t.programId, t.orderIndex),
]);

export const exercises = sqliteTable('Exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workoutId: integer('workoutId').notNull()
    .references(() => workouts.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  targetSets: integer('targetSets').notNull(),
  targetReps: text('targetReps').notNull(), // string to allow ranges like "8-10"
  orderIndex: integer('orderIndex').notNull(),
  supersetGroup: text('supersetGroup').$type<SupersetGroup>(),
  exerciseType: text('exerciseType').$type<ExerciseType>().notNull().default('strength'),
  cardioModality: text('cardioModality').$type<CardioModality>(),
  targetDurationSec: integer('targetDurationSec'),
  targetDistance: real('targetDistance'), // miles
  ...timestamps,
  catalogId: catalogRef(),
}, (t) => [
  index('exercises_workout_id_order_index').on(t.workoutId, t.orderIndex),
  index('exercises_catalog_id').on(t.catalogId),
]);

export const sessions = sqliteTable('Sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  programId: integer('programId')
    .references(() => programs.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  programName: text('programName').notNull(),
  workoutId: integer('workoutId')
    .references(() => workouts.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  workoutName: text('workoutName').notNull(),
  completedAt: sequelizeDate('completedAt'),
  isAdHoc: integer('isAdHoc', { mode: 'boolean' }).notNull().default(false),
  heartRateAvg: integer('heartRateAvg'),
  heartRateMin: integer('heartRateMin'),
  heartRateMax: integer('heartRateMax'),
  heartRateSeries: text('heartRateSeries'), // JSON string; the frontend parses it
  exerciseNotes: text('exerciseNotes', { mode: 'json' }).$type<Record<string, string>>(),
  ...timestamps,
}, (t) => [
  index('sessions_program_id').on(t.programId),
  index('sessions_workout_id').on(t.workoutId),
  index('sessions_completed_at').on(t.completedAt),
  index('sessions_program_id_workout_id').on(t.programId, t.workoutId),
]);

export const sets = sqliteTable('Sets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('sessionId').notNull()
    .references(() => sessions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  exerciseId: integer('exerciseId')
    .references(() => exercises.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  exerciseName: text('exerciseName').notNull(),
  weight: real('weight').notNull(),
  reps: integer('reps').notNull(),
  setNumber: integer('setNumber').notNull(),
  perceivedEffort: integer('perceivedEffort'),
  dropIndex: integer('dropIndex').notNull().default(0),
  heartRateAvg: integer('heartRateAvg'),
  heartRateMax: integer('heartRateMax'),
  durationSec: integer('durationSec'),
  distance: real('distance'), // miles
  ...timestamps,
  catalogId: catalogRef(),
}, (t) => [
  index('sets_session_id').on(t.sessionId),
  index('sets_exercise_id').on(t.exerciseId),
  index('sets_session_id_exercise_id').on(t.sessionId, t.exerciseId),
  index('sets_catalog_id').on(t.catalogId),
]);

// ---- Relations (relational query API) ----

export const exerciseCatalogRelations = relations(exerciseCatalog, ({ many }) => ({
  exercises: many(exercises),
  sets: many(sets),
}));

export const programsRelations = relations(programs, ({ many }) => ({
  workouts: many(workouts),
  sessions: many(sessions),
}));

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
  program: one(programs, { fields: [workouts.programId], references: [programs.id] }),
  exercises: many(exercises),
  sessions: many(sessions),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  workout: one(workouts, { fields: [exercises.workoutId], references: [workouts.id] }),
  catalog: one(exerciseCatalog, { fields: [exercises.catalogId], references: [exerciseCatalog.id] }),
  sets: many(sets),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  program: one(programs, { fields: [sessions.programId], references: [programs.id] }),
  workout: one(workouts, { fields: [sessions.workoutId], references: [workouts.id] }),
  sets: many(sets),
}));

export const setsRelations = relations(sets, ({ one }) => ({
  session: one(sessions, { fields: [sets.sessionId], references: [sessions.id] }),
  exercise: one(exercises, { fields: [sets.exerciseId], references: [exercises.id] }),
  catalog: one(exerciseCatalog, { fields: [sets.catalogId], references: [exerciseCatalog.id] }),
}));

// ---- Row types ----

export type CatalogEntry = typeof exerciseCatalog.$inferSelect;
export type NewCatalogEntry = typeof exerciseCatalog.$inferInsert;
export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Set = typeof sets.$inferSelect;
export type NewSet = typeof sets.$inferInsert;
