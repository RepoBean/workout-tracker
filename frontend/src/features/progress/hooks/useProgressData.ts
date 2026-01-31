import { useMemo } from 'react';
import { useHistory, usePrograms } from '../../../shared/api/queries';
import type { Session, Set } from '../../../shared/api/types';

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

export interface WeeklyVolume {
    weekStart: string;      // ISO date of Monday
    weekLabel: string;      // e.g., "Jan 6"
    totalVolume: number;    // sum of weight × reps for all sets
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

export interface UseProgressDataReturn {
    isLoading: boolean;
    error: Error | null;

    // For exercise picker
    allExerciseNames: string[];           // Unique exercise names from history
    mostTrainedExercises: string[];       // Top 5 by frequency
    activeExercises: string[];            // Exercises from active program

    // For chart/list
    getExerciseHistory: (name: string) => ExerciseSession[];

    // For volume trends
    weeklyVolumes: WeeklyVolume[];        // Last 12 weeks, oldest first
    thisWeekVolume: number;
    lastWeekVolume: number;
    thisMonthVolume: number;
    lastMonthVolume: number;

    // For personal records
    personalRecords: PersonalRecord[];    // Best set per exercise, sorted by 1RM desc
}

export function useProgressData(): UseProgressDataReturn {
    const { data: sessions, isLoading: historyLoading, error: historyError } = useHistory(200, 0);
    const { data: programs, isLoading: programsLoading } = usePrograms();

    // Derive unique exercise names from history
    const allExerciseNames = useMemo(() => {
        if (!sessions) return [];
        const names = new Set<string>();
        sessions.forEach((session: Session) => {
            session.sets?.forEach((set: Set) => {
                if (set.exerciseName) {
                    names.add(set.exerciseName);
                }
            });
        });
        return Array.from(names).sort();
    }, [sessions]);

    // Derive top 5 most trained exercises by frequency
    const mostTrainedExercises = useMemo(() => {
        if (!sessions) return [];
        const counts = new Map<string, number>();
        sessions.forEach((session: Session) => {
            session.sets?.forEach((set: Set) => {
                if (set.exerciseName) {
                    counts.set(set.exerciseName, (counts.get(set.exerciseName) || 0) + 1);
                }
            });
        });
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name]) => name);
    }, [sessions]);

    // Derive exercises from active program
    const activeExercises = useMemo(() => {
        if (!programs) return [];
        const activeProgram = programs.find(p => p.isActive);
        if (!activeProgram?.workouts) return [];

        const names = new Set<string>();
        activeProgram.workouts.forEach(workout => {
            workout.exercises?.forEach(exercise => {
                names.add(exercise.name);
            });
        });
        return Array.from(names);
    }, [programs]);

    // Get exercise history for chart/list
    const getExerciseHistory = useMemo(() => {
        return (name: string): ExerciseSession[] => {
            if (!sessions) return [];

            const result: ExerciseSession[] = [];

            sessions.forEach((session: Session) => {
                // Only include completed sessions
                if (!session.completedAt) return;

                const exerciseSets = session.sets?.filter(
                    (set: Set) => set.exerciseName === name
                ) || [];

                if (exerciseSets.length === 0) return;

                const weights = exerciseSets.map(s => s.weight);
                const bestWeight = Math.max(...weights);

                // Calculate best volume and estimated 1RM
                let bestVolume = 0;
                let bestEstimated1RM = 0;

                exerciseSets.forEach(set => {
                    const volume = set.weight * set.reps;
                    if (volume > bestVolume) {
                        bestVolume = volume;
                        // Epley formula based on the best volume set
                        bestEstimated1RM = Math.round(set.weight * (1 + set.reps / 30));
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
        };
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
                sessionVolume += set.weight * set.reps;
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
    }, [sessions]);

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
                sessionVolume += set.weight * set.reps;
            });

            if (sessionMonth === thisMonth && sessionYear === thisYear) {
                thisMonthTotal += sessionVolume;
            } else if (sessionMonth === lastMonth && sessionYear === lastMonthYear) {
                lastMonthTotal += sessionVolume;
            }
        });

        return { thisMonthVolume: thisMonthTotal, lastMonthVolume: lastMonthTotal };
    }, [sessions]);

    // Calculate personal records (best volume set per exercise)
    const personalRecords = useMemo((): PersonalRecord[] => {
        if (!sessions) return [];

        // Track best set per exercise
        const bestByExercise = new Map<string, {
            volume: number;
            weight: number;
            reps: number;
            date: string;
        }>();

        sessions.forEach((session: Session) => {
            if (!session.completedAt) return;

            session.sets?.forEach((set: Set) => {
                if (!set.exerciseName) return;

                const volume = set.weight * set.reps;
                const existing = bestByExercise.get(set.exerciseName);

                if (!existing || volume > existing.volume) {
                    bestByExercise.set(set.exerciseName, {
                        volume,
                        weight: set.weight,
                        reps: set.reps,
                        date: session.completedAt!,
                    });
                }
            });
        });

        // Convert to PersonalRecord array
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const records: PersonalRecord[] = [];
        bestByExercise.forEach((best, exerciseName) => {
            // Epley formula: weight × (1 + reps / 30)
            const estimated1RM = Math.round(best.weight * (1 + best.reps / 30));
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
    }, [sessions]);

    return {
        isLoading: historyLoading || programsLoading,
        error: historyError,
        allExerciseNames,
        mostTrainedExercises,
        activeExercises,
        getExerciseHistory,
        weeklyVolumes,
        thisWeekVolume,
        lastWeekVolume,
        thisMonthVolume,
        lastMonthVolume,
        personalRecords,
    };
}

