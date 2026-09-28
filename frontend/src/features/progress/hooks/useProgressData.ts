import { useMemo } from 'react';
import { useHistory, usePrograms } from '../../../shared/api/queries';
import type { Program, Session, Set } from '../../../shared/api/types';
import { setVolume } from '../../../shared/lib/effectiveWeight';
import { useUserProfile } from '../../../shared/context/UserProfileContext';
import {
    buildExerciseIndex,
    cardioHistory,
    personalRecords as computePersonalRecords,
    strengthHistory,
    type CardioExerciseSession,
    type ExerciseSession,
    type PersonalRecord,
} from '../logic/exerciseIndex';

export type { CardioExerciseSession, ExerciseSession, PersonalRecord };

export interface WeeklyVolume {
    weekStart: string;      // ISO date of Monday
    weekLabel: string;      // e.g., "Jan 6"
    totalVolume: number;    // sum of weight × reps for all sets
}

export interface UseProgressDataReturn {
    isLoading: boolean;
    error: Error | null;

    // For exercise picker
    allExerciseNames: string[];           // Unique exercise names from history
    mostTrainedExercises: string[];       // Top 5 by frequency
    activeExercises: string[];            // Strength exercises from active program

    // For chart/list (strength)
    getExerciseHistory: (name: string) => ExerciseSession[];

    // Cardio counterparts
    allCardioExerciseNames: string[];     // Names with at least one cardio set
    activeCardioExercises: string[];      // Cardio exercises from active program
    getCardioExerciseHistory: (name: string) => CardioExerciseSession[];

    // For volume trends
    weeklyVolumes: WeeklyVolume[];        // Last 12 weeks, oldest first
    thisWeekVolume: number;
    lastWeekVolume: number;
    thisMonthVolume: number;
    lastMonthVolume: number;

    // For personal records
    personalRecords: PersonalRecord[];    // Best set per exercise, sorted by 1RM desc
}

const NO_SESSIONS: Session[] = [];
const NO_PROGRAMS: Program[] = [];

export function useProgressData(): UseProgressDataReturn {
    // All-time records/trends need effectively every session, not a page — the
    // backend clamps limit at 2000, so 1000 covers a personal lifetime of data.
    const { data: sessions, isLoading: historyLoading, error: historyError } = useHistory(1000, 0);
    const { data: programs, isLoading: programsLoading } = usePrograms();
    // Assisted (negative-weight) sets score as bodyweight + weight; without a
    // bodyweight they are skipped from bests/volume, like 0-weight sets.
    const { profile: { bodyweight } } = useUserProfile();
    const volumeOf = useMemo(() => (set: Set) => setVolume(set, bodyweight), [bodyweight]);

    // Picker names, most-trained, and active-program names (logic/exerciseIndex.ts)
    const index = useMemo(
        () => buildExerciseIndex(sessions ?? NO_SESSIONS, programs ?? NO_PROGRAMS),
        [sessions, programs]
    );

    // Get exercise history for chart/list
    const getExerciseHistory = useMemo(() => {
        return (name: string): ExerciseSession[] =>
            sessions ? strengthHistory(sessions, name, bodyweight) : [];
    }, [sessions, bodyweight]);

    const getCardioExerciseHistory = useMemo(() => {
        return (name: string): CardioExerciseSession[] =>
            sessions ? cardioHistory(sessions, name) : [];
    }, [sessions]);

    // Helper: Get Monday (week start) for a given date
    const getMonday = (date: Date): Date => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    };

    // Helper: Format week label (e.g., "Jan 6")
    const formatWeekLabel = (date: Date): string => {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Calculate weekly volumes (last 12 weeks)
    const weeklyVolumes = useMemo((): WeeklyVolume[] => {
        if (!sessions) return [];

        // Group sessions by week and calculate volume
        const volumeByWeek = new Map<string, number>();

        sessions.forEach((session: Session) => {
            if (!session.completedAt) return;

            const sessionDate = new Date(session.completedAt);
            const monday = getMonday(sessionDate);
            const weekKey = monday.toISOString().split('T')[0];

            let sessionVolume = 0;
            session.sets?.forEach((set: Set) => {
                sessionVolume += volumeOf(set);
            });

            volumeByWeek.set(weekKey, (volumeByWeek.get(weekKey) || 0) + sessionVolume);
        });

        // Generate last 12 weeks
        const today = new Date();
        const currentMonday = getMonday(today);
        const weeks: WeeklyVolume[] = [];

        for (let i = 11; i >= 0; i--) {
            const weekStart = new Date(currentMonday);
            weekStart.setDate(weekStart.getDate() - (i * 7));
            const weekKey = weekStart.toISOString().split('T')[0];

            weeks.push({
                weekStart: weekKey,
                weekLabel: formatWeekLabel(weekStart),
                totalVolume: volumeByWeek.get(weekKey) || 0,
            });
        }

        return weeks;
    }, [sessions, volumeOf]);

    // Calculate current and previous week volumes
    const { thisWeekVolume, lastWeekVolume } = useMemo(() => {
        if (weeklyVolumes.length < 2) {
            return { thisWeekVolume: 0, lastWeekVolume: 0 };
        }
        return {
            thisWeekVolume: weeklyVolumes[weeklyVolumes.length - 1]?.totalVolume || 0,
            lastWeekVolume: weeklyVolumes[weeklyVolumes.length - 2]?.totalVolume || 0,
        };
    }, [weeklyVolumes]);

    // Calculate current and previous month volumes
    const { thisMonthVolume, lastMonthVolume } = useMemo(() => {
        if (!sessions) return { thisMonthVolume: 0, lastMonthVolume: 0 };

        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
        const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

        let thisMonthTotal = 0;
        let lastMonthTotal = 0;

        sessions.forEach((session: Session) => {
            if (!session.completedAt) return;

            const sessionDate = new Date(session.completedAt);
            const sessionMonth = sessionDate.getMonth();
            const sessionYear = sessionDate.getFullYear();

            let sessionVolume = 0;
            session.sets?.forEach((set: Set) => {
                sessionVolume += volumeOf(set);
            });

            if (sessionMonth === thisMonth && sessionYear === thisYear) {
                thisMonthTotal += sessionVolume;
            } else if (sessionMonth === lastMonth && sessionYear === lastMonthYear) {
                lastMonthTotal += sessionVolume;
            }
        });

        return { thisMonthVolume: thisMonthTotal, lastMonthVolume: lastMonthTotal };
    }, [sessions, volumeOf]);

    // Calculate personal records (best volume set per exercise)
    const personalRecords = useMemo(
        (): PersonalRecord[] => sessions ? computePersonalRecords(sessions, bodyweight) : [],
        [sessions, bodyweight]
    );

    return {
        isLoading: historyLoading || programsLoading,
        error: historyError,
        allExerciseNames: index.allExerciseNames,
        mostTrainedExercises: index.mostTrainedExercises,
        activeExercises: index.activeExercises,
        getExerciseHistory,
        allCardioExerciseNames: index.allCardioExerciseNames,
        activeCardioExercises: index.activeCardioExercises,
        getCardioExerciseHistory,
        weeklyVolumes,
        thisWeekVolume,
        lastWeekVolume,
        thisMonthVolume,
        lastMonthVolume,
        personalRecords,
    };
}
