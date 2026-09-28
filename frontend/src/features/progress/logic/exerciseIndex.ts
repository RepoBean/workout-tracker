// Pure grouping / records math behind the Progress page. useProgressData is a thin
// useMemo wrapper over these, so the rules can be tested without rendering.

import type { Program, Session, Set } from '../../../shared/api/types';
import { isCardioExercise, isCardioSet } from '../../../shared/api/predicates';
import { epleyOneRepMax } from '../../../shared/lib/oneRepMax';
import { effectiveWeight } from '../../../shared/lib/effectiveWeight';

export interface ExerciseSession {
    sessionId: number;
    date: string;           // completedAt
    workoutName: string;
    sets: Array<{
        weight: number;
        reps: number;
        setNumber: number;
        perceivedEffort?: number;
        dropIndex: number;
    }>;
    bestWeight: number;     // heaviest weight in this session
    bestVolume: number;     // highest (weight × reps) from a single set
    bestEstimated1RM: number; // Epley: weight × (1 + reps/30) from best volume set
}

export interface PersonalRecord {
    exerciseName: string;
    bestVolume: number;           // weight × reps
    bestVolumeWeight: number;     // weight of that set
    bestVolumeReps: number;       // reps of that set
    bestVolumeDate: string;       // when achieved (ISO date string)
    estimated1RM: number;         // Epley formula: weight × (1 + reps / 30)
    isRecentPR: boolean;          // achieved in last 30 days
}

export interface CardioExerciseSession {
    sessionId: number;
    date: string;                   // completedAt
    workoutName: string;
    totalDurationSec: number;       // sum across all cardio sets in session
    totalDistance: number;          // miles, 0 if none logged
    avgPaceMph: number | null;      // null when totalDistance is 0
    avgHr: number | null;           // duration-weighted across sets with HR
    sets: Array<{
        setNumber: number;
        durationSec: number;
        distance: number | null;
        heartRateAvg: number | null;
        perceivedEffort?: number;
    }>;
}

export interface ExerciseIndex {
    allExerciseNames: string[];       // Unique exercise names from history, sorted
    mostTrainedExercises: string[];   // Top 5 by set count
    allCardioExerciseNames: string[]; // Names with at least one cardio set, sorted
    activeExercises: string[];        // Strength exercises from the active program
    activeCardioExercises: string[];  // Cardio exercises from the active program
}

function activeProgramNames(programs: Program[], cardio: boolean): string[] {
    const activeProgram = programs.find(p => p.isActive);
    if (!activeProgram?.workouts) return [];

    const names = new Set<string>();
    activeProgram.workouts.forEach(workout => {
        workout.exercises?.forEach(exercise => {
            if (isCardioExercise(exercise) !== cardio) return;
            names.add(exercise.name);
        });
    });
    return Array.from(names);
}

export function buildExerciseIndex(sessions: Session[], programs: Program[]): ExerciseIndex {
    const names = new Set<string>();
    const cardioNames = new Set<string>();
    const counts = new Map<string, number>();

    sessions.forEach(session => {
        session.sets?.forEach((set: Set) => {
            if (!set.exerciseName) return;
            names.add(set.exerciseName);
            counts.set(set.exerciseName, (counts.get(set.exerciseName) || 0) + 1);
            if (isCardioSet(set)) cardioNames.add(set.exerciseName);
        });
    });

    return {
        allExerciseNames: Array.from(names).sort(),
        mostTrainedExercises: Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name),
        allCardioExerciseNames: Array.from(cardioNames).sort(),
        activeExercises: activeProgramNames(programs, false),
        activeCardioExercises: activeProgramNames(programs, true),
    };
}

/** Per-session strength history for one exercise, oldest first (chart order). */
export function strengthHistory(
    sessions: Session[],
    name: string,
    bodyweight: number | null,
): ExerciseSession[] {
    const result: ExerciseSession[] = [];

    sessions.forEach(session => {
        // Only include completed sessions
        if (!session.completedAt) return;

        const exerciseSets = session.sets?.filter(
            (set: Set) => set.exerciseName === name && !isCardioSet(set)
        ) || [];

        if (exerciseSets.length === 0) return;

        // Bests exclude drop sets (dropIndex > 0) to match the PR
        // celebration in active-session/logic/personalRecord.ts;
        // the display list below keeps them.
        // Bests use effective load so an assisted lift's chart stays on one
        // scale (−40 at 185 bw plots as 145, like hand-entered effective sets).
        const workingSets = exerciseSets
            .filter(s => (s.dropIndex || 0) === 0)
            .flatMap(s => {
                const weight = effectiveWeight(s.weight, bodyweight);
                return weight == null ? [] : [{ weight, reps: s.reps }];
            });

        const bestWeight = workingSets.length > 0
            ? Math.max(...workingSets.map(s => s.weight))
            : 0;

        // Calculate best volume and estimated 1RM independently
        let bestVolume = 0;
        let bestEstimated1RM = 0;

        workingSets.forEach(set => {
            const volume = set.weight * set.reps;
            if (volume > bestVolume) {
                bestVolume = volume;
            }
            // Epley formula: track highest 1RM across all sets
            const estimated1RM = epleyOneRepMax(set.weight, set.reps);
            if (estimated1RM > bestEstimated1RM) {
                bestEstimated1RM = estimated1RM;
            }
        });

        result.push({
            sessionId: session.id,
            date: session.completedAt,
            workoutName: session.workoutName,
            sets: exerciseSets
                .map(s => ({
                    weight: s.weight,
                    reps: s.reps,
                    setNumber: s.setNumber,
                    perceivedEffort: s.perceivedEffort ?? undefined,
                    dropIndex: s.dropIndex,
                }))
                .sort((a, b) => {
                    if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber;
                    return a.dropIndex - b.dropIndex;
                }),
            bestWeight,
            bestVolume,
            bestEstimated1RM,
        });
    });

    // Sort by date ascending for chart (oldest first)
    return result.sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );
}

/** Per-session cardio history for one exercise, oldest first. */
export function cardioHistory(sessions: Session[], name: string): CardioExerciseSession[] {
    const result: CardioExerciseSession[] = [];

    sessions.forEach(session => {
        if (!session.completedAt) return;

        const cardioSets = session.sets?.filter(
            (set: Set) => set.exerciseName === name && isCardioSet(set)
        ) || [];

        if (cardioSets.length === 0) return;

        let totalDurationSec = 0;
        let totalDistance = 0;
        let hrWeightedSum = 0;
        let hrWeightTotal = 0;

        cardioSets.forEach(s => {
            const dur = s.durationSec ?? 0;
            const dist = s.distance ?? 0;
            totalDurationSec += dur;
            totalDistance += dist;
            if (s.heartRateAvg != null && dur > 0) {
                hrWeightedSum += s.heartRateAvg * dur;
                hrWeightTotal += dur;
            }
        });

        const avgPaceMph =
            totalDistance > 0 && totalDurationSec > 0
                ? totalDistance / (totalDurationSec / 3600)
                : null;
        const avgHr = hrWeightTotal > 0
            ? Math.round(hrWeightedSum / hrWeightTotal)
            : null;

        result.push({
            sessionId: session.id,
            date: session.completedAt,
            workoutName: session.workoutName,
            totalDurationSec,
            totalDistance,
            avgPaceMph,
            avgHr,
            sets: cardioSets
                .map(s => ({
                    setNumber: s.setNumber,
                    durationSec: s.durationSec ?? 0,
                    distance: s.distance,
                    heartRateAvg: s.heartRateAvg,
                    perceivedEffort: s.perceivedEffort ?? undefined,
                }))
                .sort((a, b) => a.setNumber - b.setNumber),
        });
    });

    return result.sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );
}

/** Best volume set + best 1RM per strength exercise, strongest (1RM) first. */
export function personalRecords(
    sessions: Session[],
    bodyweight: number | null,
    now: Date = new Date(),
): PersonalRecord[] {
    // Track best volume set and best 1RM per exercise independently
    const bestVolumeByExercise = new Map<string, {
        volume: number;
        weight: number;
        reps: number;
        date: string;
    }>();
    const best1RMByExercise = new Map<string, {
        estimated1RM: number;
        date: string;
    }>();

    sessions.forEach(session => {
        if (!session.completedAt) return;

        session.sets?.forEach((set: Set) => {
            if (!set.exerciseName) return;
            // Strength PRs only
            if (isCardioSet(set)) return;
            // Drop sets don't count toward PRs (matches personalRecord.ts)
            if ((set.dropIndex || 0) > 0) return;
            // Assisted sets use effective load; skipped without a bodyweight
            const weight = effectiveWeight(set.weight, bodyweight);
            if (weight == null) return;

            // Track best volume set
            const volume = weight * set.reps;
            const existingVolume = bestVolumeByExercise.get(set.exerciseName);
            if (!existingVolume || volume > existingVolume.volume) {
                bestVolumeByExercise.set(set.exerciseName, {
                    volume,
                    weight,
                    reps: set.reps,
                    date: session.completedAt!,
                });
            }

            // Track best estimated 1RM independently
            const estimated1RM = epleyOneRepMax(weight, set.reps);
            const existing1RM = best1RMByExercise.get(set.exerciseName);
            if (!existing1RM || estimated1RM > existing1RM.estimated1RM) {
                best1RMByExercise.set(set.exerciseName, {
                    estimated1RM,
                    date: session.completedAt!,
                });
            }
        });
    });

    // Convert to PersonalRecord array
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const records: PersonalRecord[] = [];
    bestVolumeByExercise.forEach((best, exerciseName) => {
        const best1RM = best1RMByExercise.get(exerciseName);
        const estimated1RM = best1RM?.estimated1RM ?? epleyOneRepMax(best.weight, best.reps);
        const prDate = new Date(best.date);
        const isRecentPR = prDate >= thirtyDaysAgo;

        records.push({
            exerciseName,
            bestVolume: best.volume,
            bestVolumeWeight: best.weight,
            bestVolumeReps: best.reps,
            bestVolumeDate: best.date,
            estimated1RM,
            isRecentPR,
        });
    });

    // Sort by estimated 1RM descending (strongest lifts first)
    return records.sort((a, b) => b.estimated1RM - a.estimated1RM);
}
