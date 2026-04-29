import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';
import { usePrograms } from '../../../shared/api/queries';
import { useStartSession } from '../../active-session/hooks/useStartSession';
import { api } from '../../../shared/api/client';
import { useToast } from '../../../shared/ui/Toast';
import { CARDIO_MODALITY_OPTIONS } from '../../../shared/api/cardio';
import type { ActiveSession, CardioModality, Program, Workout } from '../../../shared/api/types';

interface AdHocWorkoutPickerProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AdHocWorkoutPicker({ isOpen, onClose }: AdHocWorkoutPickerProps) {
    const { data: programs, isLoading } = usePrograms();
    const startSession = useStartSession();
    const navigate = useNavigate();
    const toast = useToast();
    const [expandedProgramId, setExpandedProgramId] = useState<number | null>(null);
    const [showCardioPicker, setShowCardioPicker] = useState(false);

    const startCardioSession = useMutation({
        mutationFn: async (modality: CardioModality) => {
            const { data } = await api.post<ActiveSession>('/sessions/start', { isAdHoc: true });
            return { session: data, modality };
        },
        onSuccess: ({ session, modality }) => {
            navigate(`/workout/${session.id}?cardio=${modality}`);
        },
        onError: () => {
            toast.error('Failed to start cardio. Please try again.');
        },
    });

    const handleBlankWorkout = () => {
        startSession.mutate({ isAdHoc: true });
        onClose();
    };

    const handleStartCardio = (modality: CardioModality) => {
        startCardioSession.mutate(modality);
        onClose();
    };

    const handleSelectWorkout = (workoutId: number) => {
        startSession.mutate({ workoutId, isAdHoc: true });
        onClose();
    };

    const toggleProgram = (programId: number) => {
        setExpandedProgramId(expandedProgramId === programId ? null : programId);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Start Quick Workout">
            <div className="space-y-4">
                {/* Blank workout option */}
                <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={handleBlankWorkout}
                    disabled={startSession.isPending}
                >
                    <div className="flex items-center gap-3">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        <span>Blank Workout</span>
                    </div>
                </Button>

                {/* Quick Cardio */}
                {!showCardioPicker ? (
                    <Button
                        variant="secondary"
                        size="lg"
                        className="w-full"
                        onClick={() => setShowCardioPicker(true)}
                        disabled={startCardioSession.isPending}
                    >
                        <div className="flex items-center gap-3">
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                            <span>Quick Cardio</span>
                        </div>
                    </Button>
                ) : (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Pick a cardio type</div>
                        <div className="grid grid-cols-2 gap-2">
                            {CARDIO_MODALITY_OPTIONS.map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => handleStartCardio(value)}
                                    disabled={startCardioSession.isPending}
                                    className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white
                                               hover:bg-primary-700 active:scale-[0.97] transition-all
                                               disabled:opacity-50"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowCardioPicker(false)}
                            className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* Divider */}
                <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">or from a program</span>
                    <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
                </div>

                {/* Programs list */}
                {isLoading ? (
                    <div className="flex justify-center py-4">
                        <div className="animate-spin w-6 h-6 border-2 border-primary-600
                            border-t-transparent rounded-full" />
                    </div>
                ) : programs && programs.length > 0 ? (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                        {programs.filter((p: Program) => !p.isArchived).map((program: Program) => (
                            <div key={program.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                {/* Program header */}
                                <button
                                    onClick={() => toggleProgram(program.id)}
                                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    <div className="flex items-center gap-2">
                                        <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                        <span className="font-medium">{program.name}</span>
                                        {program.isActive && (
                                            <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900 
                                     text-green-700 dark:text-green-300 text-xs rounded">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <svg
                                        className={`w-5 h-5 text-gray-400 transition-transform ${expandedProgramId === program.id ? 'rotate-180' : ''}`}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {/* Workouts list (expanded) */}
                                {expandedProgramId === program.id && program.workouts && (
                                    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-surface-800/50">
                                        {program.workouts.length > 0 ? (
                                            program.workouts.map((workout: Workout) => (
                                                <button
                                                    key={workout.id}
                                                    onClick={() => handleSelectWorkout(workout.id)}
                                                    disabled={startSession.isPending}
                                                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-700 
                                     border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                                                >
                                                    <svg className="w-4 h-4 text-gray-400 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                            d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                                    </svg>
                                                    <span>{workout.name}</span>
                                                    {workout.exercises && (
                                                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
                                                            {workout.exercises.length} exercises
                                                        </span>
                                                    )}
                                                </button>
                                            ))
                                        ) : (
                                            <p className="p-3 text-sm text-gray-500 dark:text-gray-400">
                                                No workouts in this program
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                        No programs found. Create a program first.
                    </p>
                )}
            </div>
        </Modal>
    );
}
