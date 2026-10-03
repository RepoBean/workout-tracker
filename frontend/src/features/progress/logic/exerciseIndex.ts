// Pure grouping / records math behind the Progress page. useProgressData is a thin
// useMemo wrapper over these, so the rules can be tested without rendering.
// Everything groups by exercise-catalog identity (shared/lib/catalog.ts), so a lift
// logged under two spellings that were merged in Settings is one series.

import type { Program, Session, Set } from '../../../shared/api/types';
import { isCardioExercise, isCardioSet } from '../../../shared/api/predicates';
import { epleyOneRepMax } from '../../../shared/lib/oneRepMax';
import { effectiveWeight } from '../../../shared/lib/effectiveWeight';
import { groupName, NO_CATALOG, type CatalogNames } from '../../../shared/lib/catalog';

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

/**
 * Best estimated 1RM per lift — the same rule as the in-session PR toast
 * (active-session/logic/personalRecord.ts): working sets only, effective weight > 0,
 * reps > 0. weight/reps/date describe the set the 1RM came from.
 */
export interface PersonalRecord {
    exerciseName: string;
    estimated1RM: number;         // Epley (a single is its own 1RM)
    weight: number;               // effective weight of that set
    reps: number;                 // reps of that set
    date: string;                 // completedAt of the session it was set in (first time reached)
    isRecentPR: boolean;          // set in the last 30 days
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

const setName = (set: Set, catalog: CatalogNames) => groupName(set.catalogId, set.exerciseName, catalog);

export interface ExerciseIndex {
    allExerciseNames: string[];       // Unique exercise names from history, sorted
    allStrengthExerciseNames: string[]; // Names with at least one strength set, sorted
    allCardioExerciseNames: string[]; // Names with at least one cardio set, sorted
    mostTrainedStrength: string[];    // Top 5 by strength-set count
    mostTrainedCardio: string[];      // Top 5 by cardio-set count (cardio logs ~1 set/session)
    activeExercises: string[];        // Strength exercises from the active program
    activeCardioExercises: string[];  // Cardio exercises from the active program
}

const MOST_TRAINED = 5;

/** Top names by count; ties keep first-seen order (history arrives newest first). */
function topByCount(counts: Map<string, number>): string[] {
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, MOST_TRAINED)
        .map(([name]) => name);
}

function activeProgramNames(programs: Program[], cardio: boolean, catalog: CatalogNames): string[] {
    const activeProgram = programs.find(p => p.isActive);
    if (!activeProgram?.workouts) return [];

    const names = new Set<string>();
    activeProgram.workouts.forEach(workout => {
        workout.exercises?.forEach(exercise => {
            if (isCardioExercise(exercise) !== cardio) return;
            names.add(groupName(exercise.catalogId, exercise.name, catalog));
        });
    });
    return Array.from(names);
}

export function buildExerciseIndex(
    sessions: Session[],
    programs: Program[],
    catalog: CatalogNames = NO_CATALOG,
): ExerciseIndex {
    const names = new Set<string>();
    const strengthCounts = new Map<string, number>();
    const cardioCounts = new Map<string, number>();

    sessions.forEach(session => {
        session.sets?.forEach((set: Set) => {
            if (!set.exerciseName) return;
            const name = setName(set, catalog);
            names.add(name);
            const counts = isCardioSet(set) ? cardioCounts : strengthCounts;
            counts.set(name, (counts.get(name) || 0) + 1);
        });
    });

    return {
        allExerciseNames: Array.from(names).sort(),
        allStrengthExerciseNames: Array.from(strengthCounts.keys()).sort(),
        allCardioExerciseNames: Array.from(cardioCounts.keys()).sort(),
        mostTrainedStrength: topByCount(strengthCounts),
        mostTrainedCardio: topByCount(cardioCounts),
        activeExercises: activeProgramNames(programs, false, catalog),
        activeCardioExercises: activeProgramNames(programs, true, catalog),
    };
}

/** Per-session strength history for one exercise, oldest first (chart order). */
export function strengthHistory(
    sessions: Session[],
    name: string,
    bodyweight: number | null,
    catalog: CatalogNames = NO_CATALOG,
): ExerciseSession[] {
    const result: ExerciseSession[] = [];

    sessions.forEach(session => {
        // Only include completed sessions
        if (!session.completedAt) return;

        const exerciseSets = session.sets?.filter(
            (set: Set) => setName(set, catalog) === name && !isCardioSet(set)
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
export function cardioHistory(
    sessions: Session[],
    name: string,
    catalog: CatalogNames = NO_CATALOG,
): CardioExerciseSession[] {
    const result: CardioExerciseSession[] = [];

    sessions.forEach(session => {
        if (!session.completedAt) return;

        const cardioSets = session.sets?.filter(
            (set: Set) => setName(set, catalog) === name && isCardioSet(set)
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

/** Best estimated 1RM per strength lift (see PersonalRecord), strongest first. */
export function personalRecords(
    sessions: Session[],
    bodyweight: number | null,
    now: Date = new Date(),
    catalog: CatalogNames = NO_CATALOG,
): PersonalRecord[] {
    const best = new Map<string, Omit<PersonalRecord, 'isRecentPR'>>();

    sessions.forEach(session => {
        if (!session.completedAt) return;
        const date = session.completedAt;

        session.sets?.forEach((set: Set) => {
            if (!set.exerciseName) return;
            // Strength PRs only
            if (isCardioSet(set)) return;
            // Drop sets don't count toward PRs (matches personalRecord.ts)
            if ((set.dropIndex || 0) > 0) return;
            // Assisted sets use effective load; skipped without a bodyweight
            const weight = effectiveWeight(set.weight, bodyweight);
            if (weight == null || weight <= 0 || set.reps <= 0) return;

            const exerciseName = setName(set, catalog);
            const estimated1RM = epleyOneRepMax(weight, set.reps);
            const existing = best.get(exerciseName);
            // A tie keeps the earlier session: the PR dates from when it was first reached.
            const better = !existing
                || estimated1RM > existing.estimated1RM
                || (estimated1RM === existing.estimated1RM
                    && new Date(date).getTime() < new Date(existing.date).getTime());
            if (better) {
                best.set(exerciseName, { exerciseName, estimated1RM, weight, reps: set.reps, date });
            }
        });
    });

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return Array.from(best.values())
        .map(record => ({ ...record, isRecentPR: new Date(record.date) >= thirtyDaysAgo }))
        .sort((a, b) => b.estimated1RM - a.estimated1RM);
}
