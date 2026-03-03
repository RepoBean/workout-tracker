import type { Program } from '../models/Program.js';
import type { Workout } from '../models/Workout.js';
import type { Exercise } from '../models/Exercise.js';
import type { Session } from '../models/Session.js';
import type { Set } from '../models/Set.js';

// ============================================
// Sequelize Association Interfaces
// ============================================
// These interfaces extend models with their included associations
// to provide type-safe access when using `include` in queries.

/** Program with included workouts */
export interface ProgramWithWorkouts extends Program {
    workouts: Workout[];
}

/** Program with workouts and their exercises */
export interface ProgramWithWorkoutsAndExercises extends Program {
    workouts: WorkoutWithExercises[];
}

/** Workout with included exercises */
export interface WorkoutWithExercises extends Workout {
    exercises: Exercise[];
}

/** Workout with parent program */
export interface WorkoutWithProgram extends Workout {
    program: Program;
}

/** Workout with program and exercises */
export interface WorkoutWithProgramAndExercises extends Workout {
    program: Program;
    exercises: Exercise[];
}

/** Session with included sets */
export interface SessionWithSets extends Session {
    sets: Set[];
}

/** Set with included session */
export interface SetWithSession extends Set {
    session: Session;
}

// ============================================
