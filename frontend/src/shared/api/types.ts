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

export interface Exercise {
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

export interface Session {
  id: number;
  programId: number | null;
  programName: string;
  workoutId: number | null;
  workoutName: string;
  completedAt: string | null;
  isAdHoc: boolean;
  createdAt: string;
  updatedAt: string;
  sets?: Set[];
}

export interface Set {
  id: number;
  sessionId: number;
  exerciseId: number | null;
  exerciseName: string;
  weight: number;
  reps: number;
  setNumber: number;
  perceivedEffort: number | null;
  createdAt: string;
  updatedAt: string;
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
  workout: Workout;
}

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
