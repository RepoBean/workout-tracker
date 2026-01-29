// ============================================
// Database Model Types (match Sequelize models)
// ============================================

export interface ProgramType {
  id: number;
  name: string;
  isActive: boolean;
  isArchived: boolean;
  currentWorkoutIndex: number;
  createdAt: string;
  updatedAt: string;
  workouts?: WorkoutType[];
}

export interface WorkoutType {
  id: number;
  programId: number;
  name: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  exercises?: ExerciseType[];
}

export interface ExerciseType {
  id: number;
  workoutId: number;
  name: string;
  targetSets: number;
  targetReps: string; // String to allow ranges like "8-10"
  orderIndex: number;
  supersetGroup: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionType {
  id: number;
  programId: number | null;
  programName: string;
  workoutId: number | null;
  workoutName: string;
  completedAt: string | null;
  isAdHoc: boolean;
  createdAt: string;
  updatedAt: string;
  sets?: SetType[];
}

export interface SetType {
  id: number;
  sessionId: number;
  exerciseId: number | null;
  exerciseName: string;
  weight: number;
  reps: number;
  setNumber: number;
  perceivedEffort: number | null;
  dropIndex: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// API Request Types
// ============================================

export interface CreateProgramRequest {
  name: string;
}

export interface UpdateProgramRequest {
  name?: string;
  isActive?: boolean;
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
  supersetGroup?: string;
}

export interface UpdateExerciseRequest {
  name?: string;
  targetSets?: number;
  targetReps?: string;
  orderIndex?: number;
  supersetGroup?: string | null;
}

export interface StartSessionRequest {
  workoutId?: number;
  isAdHoc?: boolean;
}

export interface LogSetRequest {
  exerciseId?: number;
  exerciseName: string;
  weight: number;
  reps: number;
  setNumber: number;
  perceivedEffort?: number;
  dropIndex?: number;
}

export interface UpdateEffortRequest {
  perceivedEffort: number;
}

// ============================================
// API Response Types
// ============================================

export interface NextWorkoutResponse {
  program: {
    id: number;
    name: string;
    currentWorkoutIndex: number;
  };
  workout: WorkoutType;
}

export interface PaginatedSessionsResponse {
  sessions: SessionType[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiError {
  error: string;
  details?: Array<{
    path: string;
    message: string;
  }>;
}
