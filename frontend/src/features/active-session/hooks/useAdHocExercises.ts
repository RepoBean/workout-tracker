import { useMemo, useState, useEffect } from 'react';
import type { Set as SetType, Exercise } from '../../../shared/api/types';
import { isCardioSet, isCardioExercise } from '../../../shared/api/predicates';
import { makeVirtualExercise } from '../lib/virtualExercise';
import type { AdHocExercise } from '../components/AddExercise';

export function getAdHocStorageKey(sessionId: number): string {
    return `adhoc-exercises-${sessionId}`;
}

// Blank-session ad-hoc list — separate key from the program flavor above,
// which already owns `adhoc-exercises-${id}` with a different shape.
export function getAdHocBlankStorageKey(sessionId: number): string {
    return `wt:adhoc-blank:${sessionId}`;
}

function loadStoredList<T>(key: string): T[] {
    try {
        const stored = localStorage.getItem(key);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch {
        return [];
    }
}

function saveStoredList<T>(key: string, items: T[]): void {
    try {
        if (items.length === 0) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(items));
        }
    } catch {
        // silently fail
    }
}

interface UseAdHocExercisesParams {
    sessionId: number;
    session: { workoutId?: number | null } | null;
    exercises: Exercise[];  // Program exercises from session
    sets: SetType[];
}

interface UseAdHocExercisesResult {
    // State for blank ad-hoc sessions
    adHocExercises: AdHocExercise[];
    setAdHocExercises: React.Dispatch<React.SetStateAction<AdHocExercise[]>>;

    // State for ad-hoc exercises added to program workouts
    adHocProgramExercises: Exercise[];
    setAdHocProgramExercises: React.Dispatch<React.SetStateAction<Exercise[]>>;

    // Merged list: program exercises + reconstructed ad-hoc + new ad-hoc
    mergedExercises: Exercise[];

    // Set lookups
    adHocSetsByName: Map<string, SetType[]>;
    getSetsForExercise: (exercise: Exercise) => SetType[];

    // For blank ad-hoc session UI
    allAdHocExercises: AdHocExercise[];
}

export function hashName(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = Math.imul(31, hash) + name.charCodeAt(i);
    }
    return -(Math.abs(hash) + 1);
}

export function useAdHocExercises({
    sessionId,
    session,
    exercises,
    sets,
}: UseAdHocExercisesParams): UseAdHocExercisesResult {
    // State for blank ad-hoc sessions (initialized from localStorage so
    // exercises with no logged sets — e.g. a seeded cardio card mid-run —
    // survive a reload; reconstruction-from-sets can't recover those)
    const [adHocExercises, setAdHocExercises] = useState<AdHocExercise[]>(
        () => loadStoredList<AdHocExercise>(getAdHocBlankStorageKey(sessionId))
    );

    // State for ad-hoc exercises added to program workouts (initialized from localStorage)
    const [adHocProgramExercises, setAdHocProgramExercises] = useState<Exercise[]>(
        () => loadStoredList<Exercise>(getAdHocStorageKey(sessionId))
    );

    // Persist ad-hoc exercises to localStorage when they change
    useEffect(() => {
        saveStoredList(getAdHocBlankStorageKey(sessionId), adHocExercises);
    }, [sessionId, adHocExercises]);

    useEffect(() => {
        saveStoredList(getAdHocStorageKey(sessionId), adHocProgramExercises);
    }, [sessionId, adHocProgramExercises]);

    // Group sets by exercise ID
    const setsByExercise = useMemo(() => {
        const map = new Map<number, SetType[]>();
        for (const set of sets) {
            if (set.exerciseId) {
                const existing = map.get(set.exerciseId) || [];
                map.set(set.exerciseId, [...existing, set].sort(
                    (a, b) => a.setNumber - b.setNumber || (a.dropIndex || 0) - (b.dropIndex || 0)
                ));
            }
        }
        return map;
    }, [sets]);

    // Group ad-hoc sets by exerciseName (case-insensitive keys)
    const adHocSetsByName = useMemo(() => {
        const map = new Map<string, SetType[]>();
        for (const set of sets) {
            if (!set.exerciseId) {
                const key = set.exerciseName.toLowerCase();
                const existing = map.get(key) || [];
                map.set(key, [...existing, set].sort(
                    (a, b) => a.setNumber - b.setNumber || (a.dropIndex || 0) - (b.dropIndex || 0)
                ));
            }
        }
        return map;
    }, [sets]);

    // Reconstruct ad-hoc exercises from sets
    const reconstructedAdHocExercises = useMemo(() => {
        if (exercises.length === 0) return [];

        const programExerciseNames = new Set(exercises.map(e => e.name.toLowerCase()));
        const result: Exercise[] = [];

        for (const [lowerName, setsForName] of adHocSetsByName.entries()) {
            if (programExerciseNames.has(lowerName)) continue;

            // Use original case from the first set for display
            const displayName = setsForName[0]?.exerciseName ?? lowerName;

            const existingAdHoc = adHocProgramExercises.find(
                e => e.name.toLowerCase() === lowerName
            );

            const inferredCardio = setsForName.some(isCardioSet);

            result.push({
                id: existingAdHoc?.id ?? hashName(displayName),
                workoutId: session?.workoutId || 0,
                name: displayName,
                targetSets: existingAdHoc?.targetSets ?? 3,
                targetReps: existingAdHoc?.targetReps ?? '10',
                orderIndex: existingAdHoc?.orderIndex ?? (exercises.length + result.length),
                supersetGroup: existingAdHoc?.supersetGroup ?? null,
                exerciseType: existingAdHoc?.exerciseType ?? (inferredCardio ? 'cardio' : 'strength'),
                cardioModality: existingAdHoc?.cardioModality ?? null,
                targetDurationSec: existingAdHoc?.targetDurationSec ?? null,
                targetDistance: existingAdHoc?.targetDistance ?? null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        return result;
    }, [exercises, adHocSetsByName, session?.workoutId, adHocProgramExercises]);

    // All ad-hoc exercises for blank session UI (case-insensitive deduplication).
    // Canonical deduped, display-cased list: logged-set reconstruction first,
    // then the blank list. Also the source for blankMergedExercises below, so
    // declared before mergedExercises.
    const allAdHocExercises = useMemo(() => {
        const seenNames = new Set<string>(); // lowercase for deduplication
        const result: AdHocExercise[] = [];
        for (const [lowerName, setsForName] of adHocSetsByName.entries()) {
            if (!seenNames.has(lowerName)) {
                seenNames.add(lowerName);
                // Use original case from the first set for display
                const displayName = setsForName[0]?.exerciseName ?? lowerName;
                result.push({ tempId: `logged-${displayName}`, name: displayName });
            }
        }
        for (const ex of adHocExercises) {
            const lowerName = ex.name.toLowerCase();
            if (!seenNames.has(lowerName)) {
                seenNames.add(lowerName);
                result.push(ex);
            }
        }
        return result;
    }, [adHocSetsByName, adHocExercises]);

    // Blank-session exercises as full virtual Exercises so they flow through the
    // same ordering → navigation → focused-view pipeline as program workouts.
    // Keyed by hashName(name) — deterministic (survives reload so persisted order
    // ids re-match) and matching the reconstruction path, since ad-hoc sets are
    // resolved by name, not by numeric id.
    const blankMergedExercises = useMemo(() => {
        return allAdHocExercises.map((adHocEx, i) => {
            const setsForName = adHocSetsByName.get(adHocEx.name.toLowerCase());
            const isCardio = isCardioExercise(adHocEx, setsForName);
            return makeVirtualExercise({
                id: hashName(adHocEx.name),
                name: adHocEx.name,
                orderIndex: i,
                targetSets: isCardio ? 1 : 3,
                exerciseType: isCardio ? 'cardio' : 'strength',
                cardioModality: adHocEx.cardioModality ?? null,
                targetDurationSec: adHocEx.targetDurationSec ?? null,
                targetDistance: adHocEx.targetDistance ?? null,
            });
        });
    }, [allAdHocExercises, adHocSetsByName]);

    // Merge all exercises. Blank sessions (no program exercises) use the virtual
    // list above; program sessions keep program + reconstructed + new ad-hoc.
    const mergedExercises = useMemo(() => {
        if (exercises.length === 0) return blankMergedExercises;
        const reconstructedNames = new Set(reconstructedAdHocExercises.map(e => e.name.toLowerCase()));
        const programNames = new Set(exercises.map(e => e.name.toLowerCase()));
        const newAdHoc = adHocProgramExercises.filter(
            e => !reconstructedNames.has(e.name.toLowerCase()) && !programNames.has(e.name.toLowerCase())
        );
        return [...exercises, ...reconstructedAdHocExercises, ...newAdHoc];
    }, [exercises, reconstructedAdHocExercises, adHocProgramExercises, blankMergedExercises]);

    // Get sets for an exercise (case-insensitive for ad-hoc)
    const getSetsForExercise = (exercise: Exercise): SetType[] => {
        if (exercise.id < 0) {
            return adHocSetsByName.get(exercise.name.toLowerCase()) || [];
        }
        return setsByExercise.get(exercise.id) || [];
    };

    return {
        adHocExercises,
        setAdHocExercises,
        adHocProgramExercises,
        setAdHocProgramExercises,
        mergedExercises,
        adHocSetsByName,
        getSetsForExercise,
        allAdHocExercises,
    };
}
