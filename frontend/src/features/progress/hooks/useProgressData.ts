import { useMemo } from 'react';
import { useCatalog, useHistory, usePrograms } from '../../../shared/api/queries';
import type { Program, Session, Set } from '../../../shared/api/types';
import { setVolume } from '../../../shared/lib/effectiveWeight';
import { useUserProfile } from '../../../shared/context/UserProfileContext';
import { catalogNames } from '../../../shared/lib/catalog';
import {
    buildExerciseIndex,
    cardioHistory,
    personalRecords as computePersonalRecords,
    strengthHistory,
    type CardioExerciseSession,
    type ExerciseSession,
    type PersonalRecord,
} from '../logic/exerciseIndex';
import { searchExerciseNames } from '../logic/exerciseSearch';
import {
    volumeComparison,
    weeklyVolumes as computeWeeklyVolumes,
    type VolumeComparison,
    type WeeklyVolume,
} from '../logic/volumePeriods';

export type { CardioExerciseSession, ExerciseSession, PersonalRecord, VolumeComparison, WeeklyVolume };

export type ProgressMode = 'strength' | 'cardio';

export interface UseProgressDataReturn {
    isLoading: boolean;
    error: Error | null;

    // For exercise picker
    hasStrengthHistory: boolean;
    mostTrainedStrength: string[];        // Top 5 by strength-set count
    activeExercises: string[];            // Strength exercises from active program
    /** Chartable names for the mode matching `query` (incl. catalog aliases). */
    searchExercises: (query: string, mode: ProgressMode) => string[];

    // For chart/list (strength)
    getExerciseHistory: (name: string) => ExerciseSession[];

    // Cardio counterparts
    hasCardioHistory: boolean;
    mostTrainedCardio: string[];          // Top 5 by cardio-set count
    activeCardioExercises: string[];      // Cardio exercises from active program
    getCardioExerciseHistory: (name: string) => CardioExerciseSession[];

    // For volume trends
    weeklyVolumes: WeeklyVolume[];        // Last 12 whole Sunday weeks, oldest first
    volumeToDate: VolumeComparison;       // Period-to-date vs the previous period at the same point

    // For personal records
    personalRecords: PersonalRecord[];    // Best 1RM per exercise, sorted by 1RM desc
}

const NO_SESSIONS: Session[] = [];
const NO_PROGRAMS: Program[] = [];

export function useProgressData(): UseProgressDataReturn {
    // All-time records/trends need effectively every session, not a page — the
    // backend clamps limit at 2000, so 1000 covers a personal lifetime of data.
    const { data: sessions, isLoading: historyLoading, error: historyError } = useHistory(1000, 0);
    const { data: programs, isLoading: programsLoading } = usePrograms();
    // Group by catalog identity so a merged lift is one series under its catalog
    // name. Until the catalog loads, rows fall back to their own names.
    const { data: catalogEntries } = useCatalog();
    const catalog = useMemo(() => catalogNames(catalogEntries), [catalogEntries]);
    // Assisted (negative-weight) sets score as bodyweight + weight; without a
    // bodyweight they are skipped from bests/volume, like 0-weight sets.
    const { profile: { bodyweight } } = useUserProfile();
    const volumeOf = useMemo(() => (set: Set) => setVolume(set, bodyweight), [bodyweight]);

    // Picker names, most-trained, and active-program names (logic/exerciseIndex.ts)
    const index = useMemo(
        () => buildExerciseIndex(sessions ?? NO_SESSIONS, programs ?? NO_PROGRAMS, catalog),
        [sessions, programs, catalog]
    );

    // Search only what Progress can chart for the mode (logic/exerciseSearch.ts)
    const searchExercises = useMemo(() => {
        const candidates: Record<ProgressMode, string[]> = {
            strength: [...index.allStrengthExerciseNames, ...index.activeExercises],
            cardio: [...index.allCardioExerciseNames, ...index.activeCardioExercises],
        };
        return (query: string, mode: ProgressMode) =>
            searchExerciseNames(query, candidates[mode], catalogEntries);
    }, [index, catalogEntries]);

    // Get exercise history for chart/list
    const getExerciseHistory = useMemo(() => {
        return (name: string): ExerciseSession[] =>
            sessions ? strengthHistory(sessions, name, bodyweight, catalog) : [];
    }, [sessions, bodyweight, catalog]);

    const getCardioExerciseHistory = useMemo(() => {
        return (name: string): CardioExerciseSession[] =>
            sessions ? cardioHistory(sessions, name, catalog) : [];
    }, [sessions, catalog]);

    // Week/month math (logic/volumePeriods.ts)
    const weeklyVolumes = useMemo(
        () => computeWeeklyVolumes(sessions ?? NO_SESSIONS, volumeOf, new Date()),
        [sessions, volumeOf]
    );
    const volumeToDate = useMemo(
        () => volumeComparison(sessions ?? NO_SESSIONS, volumeOf, new Date()),
        [sessions, volumeOf]
    );

    // Best 1RM per exercise (same rule as the in-session PR toast)
    const personalRecords = useMemo(
        (): PersonalRecord[] =>
            sessions ? computePersonalRecords(sessions, bodyweight, new Date(), catalog) : [],
        [sessions, bodyweight, catalog]
    );

    return {
        isLoading: historyLoading || programsLoading,
        error: historyError,
        hasStrengthHistory: index.allStrengthExerciseNames.length > 0,
        mostTrainedStrength: index.mostTrainedStrength,
        activeExercises: index.activeExercises,
        searchExercises,
        getExerciseHistory,
        hasCardioHistory: index.allCardioExerciseNames.length > 0,
        mostTrainedCardio: index.mostTrainedCardio,
        activeCardioExercises: index.activeCardioExercises,
        getCardioExerciseHistory,
        weeklyVolumes,
        volumeToDate,
        personalRecords,
    };
}
