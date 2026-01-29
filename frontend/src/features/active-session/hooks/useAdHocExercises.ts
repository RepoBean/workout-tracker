import { useMemo, useState } from 'react';
import type { Set as SetType, Exercise } from '../../../shared/api/types';
import type { AdHocExercise } from '../components/AddExercise';

interface UseAdHocExercisesParams {
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
    setsByExercise: Map<number, SetType[]>;
    adHocSetsByName: Map<string, SetType[]>;
    getSetsForExercise: (exercise: Exercise) => SetType[];

    // For blank ad-hoc session UI
    allAdHocExercises: AdHocExercise[];
}

export function useAdHocExercises({
    session,
    exercises,
    sets,
}: UseAdHocExercisesParams): UseAdHocExercisesResult {
    // State for blank ad-hoc sessions
    const [adHocExercises, setAdHocExercises] = useState<AdHocExercise[]>([]);

    // State for ad-hoc exercises added to program workouts
    const [adHocProgramExercises, setAdHocProgramExercises] = useState<Exercise[]>([]);

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

    // Group ad-hoc sets by exerciseName
    const adHocSetsByName = useMemo(() => {
        const map = new Map<string, SetType[]>();
        for (const set of sets) {
            if (!set.exerciseId) {
                const existing = map.get(set.exerciseName) || [];
                map.set(set.exerciseName, [...existing, set].sort(
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

        for (const [name] of adHocSetsByName.entries()) {
            if (programExerciseNames.has(name.toLowerCase())) continue;

            const existingAdHoc = adHocProgramExercises.find(
                e => e.name.toLowerCase() === name.toLowerCase()
            );

            result.push({
                id: existingAdHoc?.id ?? (-name.length - Date.now() % 1000),
                workoutId: session?.workoutId || 0,
                name,
                targetSets: existingAdHoc?.targetSets ?? 3,
                targetReps: existingAdHoc?.targetReps ?? '10',
                orderIndex: existingAdHoc?.orderIndex ?? (exercises.length + result.length),
                supersetGroup: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        return result;
    }, [exercises, adHocSetsByName, session?.workoutId, adHocProgramExercises]);

    // Merge all exercises
    const mergedExercises = useMemo(() => {
        const reconstructedNames = new Set(reconstructedAdHocExercises.map(e => e.name.toLowerCase()));
        const newAdHoc = adHocProgramExercises.filter(
            e => !reconstructedNames.has(e.name.toLowerCase())
        );
        return [...exercises, ...reconstructedAdHocExercises, ...newAdHoc];
    }, [exercises, reconstructedAdHocExercises, adHocProgramExercises]);

    // Get sets for an exercise
    const getSetsForExercise = (exercise: Exercise): SetType[] => {
        if (exercise.id < 0) {
            return adHocSetsByName.get(exercise.name) || [];
        }
        return setsByExercise.get(exercise.id) || [];
    };

    // All ad-hoc exercises for blank session UI
    const allAdHocExercises = useMemo(() => {
        const names = new Set<string>();
        const result: AdHocExercise[] = [];
        for (const name of adHocSetsByName.keys()) {
            if (!names.has(name)) {
                names.add(name);
                result.push({ tempId: `logged-${name}`, name });
            }
        }
        for (const ex of adHocExercises) {
            if (!names.has(ex.name)) {
                names.add(ex.name);
                result.push(ex);
            }
        }
        return result;
    }, [adHocSetsByName, adHocExercises]);

    return {
        adHocExercises,
        setAdHocExercises,
        adHocProgramExercises,
        setAdHocProgramExercises,
        mergedExercises,
        setsByExercise,
        adHocSetsByName,
        getSetsForExercise,
        allAdHocExercises,
    };
}
