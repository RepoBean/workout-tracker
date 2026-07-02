// ============================================
// Database Model Types
// ============================================

export interface Program {
  id: number;
  name: string;
  isActive: boolean;
  isArchived: boolean;
  currentWorkoutIndex: number;
  createdAt: string;
  updatedAt: string;
  workouts?: Workout[];
}

export interface Workout {
  id: number;
  programId: number;
  name: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  exercises?: Exercise[];
}

export type ExerciseType = 'strength' | 'cardio';
export type CardioModality = 'running' | 'cycling' | 'treadmill' | 'rowing' | 'other';

export interface Exercise {
  id: number;
  workoutId: number;
  name: string;
  targetSets: number;
  targetReps: string; // String to allow ranges like "8-10"
  orderIndex: number;
  supersetGroup: string | null;
  exerciseType: ExerciseType;
  cardioModality: CardioModality | null;
  targetDurationSec: number | null;
  targetDistance: number | null; // miles
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: number;
  programId: number | null;
  programName: string;
  workoutId: number | null;
  workoutName: string;
  completedAt: string | null;
  isAdHoc: boolean;
  heartRateAvg: number | null;
  heartRateMin: number | null;
  heartRateMax: number | null;
  heartRateSeries: string | null;
  exerciseNotes: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
  sets?: Set[];
}

export interface Set {
  id: number;
  sessionId: number;
  exerciseId: number | null;
  exerciseName: string;
  weight: number; // 0 for cardio sets
  reps: number; // 0 for cardio sets
  setNumber: number;
  perceivedEffort: number | null;
  dropIndex: number;
  heartRateAvg: number | null;
  heartRateMax: number | null;
  durationSec: number | null;
  distance: number | null; // miles
  createdAt: string;
  updatedAt: string;
}

// ============================================
// API Response Types
// ============================================

export interface HealthCheckResponse {
  status: 'ok';
  timestamp: string;
}

export interface ApiError {
  error: string;
  details?: Array<{
    path: string;
    message: string;
  }>;
}

// ============================================
// Active Session Types
// ============================================

export interface ActiveSession extends Session {
  exercises: Exercise[];
}

export interface PreviousSetData {
  setNumber: number;
  weight: number;
  reps: number;
  perceivedEffort: number | null;
}

export interface PreviousExerciseData {
  sets: PreviousSetData[];
}

export interface PreviousSessionResponse {
  exerciseData: Record<number, PreviousExerciseData>;
  previousSessionId?: number;
}

// ============================================
// API Request Types
// ============================================

export interface StartSessionRequest {
  workoutId?: number;
  isAdHoc?: boolean;
}

export interface LogSetRequest {
  exerciseId?: number | null;
  exerciseName: string;
  weight: number;
  reps: number;
  setNumber: number;
  perceivedEffort?: number | null;
  dropIndex?: number;
  heartRateAvg?: number | null;
  heartRateMax?: number | null;
  durationSec?: number | null;
  distance?: number | null;
}

export interface CompleteSessionRequest {
  heartRateAvg?: number | null;
  heartRateMin?: number | null;
  heartRateMax?: number | null;
  heartRateSeries?: { t: number[]; b: number[] } | null;
}

export interface SetExerciseNoteRequest {
  exerciseName: string;
  note: string | null;
}

// ============================================
// CRUD Request Types
// ============================================

export interface CreateProgramRequest {
  name: string;
}

export interface UpdateProgramRequest {
  name?: string;
  isArchived?: boolean;
  currentWorkoutIndex?: number;
}

export interface CreateWorkoutRequest {
  programId: number;
  name: string;
  orderIndex: number;
}

export interface UpdateWorkoutRequest {
  name?: string;
  orderIndex?: number;
}

export interface CreateExerciseRequest {
  workoutId: number;
  name: string;
  targetSets: number;
  targetReps: string;
  orderIndex: number;
  supersetGroup?: string | null;
  exerciseType?: ExerciseType;
  cardioModality?: CardioModality | null;
  targetDurationSec?: number | null;
  targetDistance?: number | null;
}

export interface UpdateExerciseRequest {
  name?: string;
  targetSets?: number;
  targetReps?: string;
  orderIndex?: number;
  supersetGroup?: string | null;
  exerciseType?: ExerciseType;
  cardioModality?: CardioModality | null;
  targetDurationSec?: number | null;
  targetDistance?: number | null;
}

// ============================================
// Stats Types
// ============================================

export interface StatsResponse {
  totalSessions: number;
  sessionsLast30Days: number;
  weekStreak: number;
}

// ============================================
// Program Export/Import Types
// ============================================

export interface ProgramExportExercise {
  name: string;
  targetSets: number;
  targetReps: string;
  orderIndex: number;
  supersetGroup: string | null;
  exerciseType?: ExerciseType;
  cardioModality?: CardioModality | null;
  targetDurationSec?: number | null;
  targetDistance?: number | null;
}

export interface ProgramExportWorkout {
  name: string;
  orderIndex: number;
  exercises: ProgramExportExercise[];
}

export interface ProgramExportPayload {
  version: 1;
  exportedAt: string;
  program: {
    name: string;
    workouts: ProgramExportWorkout[];
  };
}
