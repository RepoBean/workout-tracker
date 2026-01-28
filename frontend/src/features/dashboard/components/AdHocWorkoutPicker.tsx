import { useState } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';
import { usePrograms } from '../../../shared/api/queries';
import { useStartSession } from '../../active-session/hooks/useStartSession';
import type { Program, Workout } from '../../../shared/api/types';

interface AdHocWorkoutPickerProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AdHocWorkoutPicker({ isOpen, onClose }: AdHocWorkoutPickerProps) {
    const { data: programs, isLoading } = usePrograms();
    const startSession = useStartSession();
    const [expandedProgramId, setExpandedProgramId] = useState<number | null>(null);

    const handleBlankWorkout = () => {
        startSession.mutate({ isAdHoc: true });
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
                                    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
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
