import { useState, useRef, useEffect } from 'react';
import { useExerciseSuggestions } from '../../../shared/api/queries';
import { useProgressData, ExerciseSession } from '../hooks/useProgressData';
import { ProgressChart } from './ProgressChart';

function formatSessionDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSetSummary(sets: ExerciseSession['sets']): string {
    if (sets.length === 0) return '';

    const weights = sets.map(s => s.weight);
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);

    if (minWeight === maxWeight) {
        return `${sets.length} sets, ${minWeight} lbs`;
    }
    return `${sets.length} sets, ${minWeight}-${maxWeight} lbs`;
}

export function ExerciseProgressTab() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const { data: suggestions } = useExerciseSuggestions(searchQuery);
    const {
        isLoading,
        mostTrainedExercises,
        activeExercises,
        getExerciseHistory
    } = useProgressData();

    useEffect(() => {
        if (suggestions && suggestions.length > 0 && searchQuery.length >= 2) {
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    }, [suggestions, searchQuery]);

    const handleSelectExercise = (name: string) => {
        setSelectedExercise(name);
        setSearchQuery('');
        setShowSuggestions(false);
    };

    const exerciseHistory = selectedExercise ? getExerciseHistory(selectedExercise) : [];
    const chartData = exerciseHistory.map(session => ({
        date: session.date,
        weight: session.bestWeight,
    }));

    if (isLoading) {
        return (
            <div className="card text-center py-8 text-gray-500">
                Loading progress data...
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Search box */}
            <div className="card">
                <div className="relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => {
                            if (suggestions && suggestions.length > 0 && searchQuery.length >= 2) {
                                setShowSuggestions(true);
                            }
                        }}
                        placeholder="Search exercise..."
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700
                       dark:border-gray-600 dark:text-white text-sm"
                    />

                    {/* Autocomplete suggestions */}
                    {showSuggestions && suggestions && suggestions.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-gray-800
                            border dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {suggestions.map((suggestion, i) => (
                                <button
                                    key={i}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100
                             dark:hover:bg-gray-700 transition-colors min-h-[44px] flex items-center"
                                    onClick={() => handleSelectExercise(suggestion)}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Quick select chips for active program exercises */}
                {activeExercises.length > 0 && (
                    <div className="mt-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Quick select:</p>
                        <div className="flex flex-wrap gap-2 overflow-x-auto">
                            {activeExercises.slice(0, 8).map((name) => (
                                <button
                                    key={name}
                                    onClick={() => handleSelectExercise(name)}
                                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors min-h-[44px]
                    ${selectedExercise === name
                                            ? 'bg-primary-600 text-white'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }`}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Most trained (when no exercise selected) */}
            {!selectedExercise && mostTrainedExercises.length > 0 && (
                <div className="card">
                    <h3 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">Most Trained</h3>
                    <div className="flex flex-wrap gap-2">
                        {mostTrainedExercises.map((name) => (
                            <button
                                key={name}
                                onClick={() => handleSelectExercise(name)}
                                className="px-3 py-2 rounded-full text-sm font-medium bg-gray-100 
                           dark:bg-gray-700 text-gray-700 dark:text-gray-300 
                           hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors min-h-[44px]"
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Chart and session list (when exercise selected) */}
            {selectedExercise && (
                <>
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                                {selectedExercise}
                            </h3>
                            <button
                                onClick={() => setSelectedExercise(null)}
                                className="text-sm text-primary-600 hover:text-primary-700"
                            >
                                Clear
                            </button>
                        </div>
                        <ProgressChart data={chartData} exerciseName={selectedExercise} />
                    </div>

                    {/* Session history list */}
                    {exerciseHistory.length > 0 && (
                        <div className="card">
                            <h3 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">
                                Session History
                            </h3>
                            <div className="space-y-2">
                                {exerciseHistory.slice().reverse().map((session) => (
                                    <div
                                        key={session.sessionId}
                                        className="flex justify-between items-center py-2 border-b 
                               border-gray-100 dark:border-gray-700 last:border-0"
                                    >
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            {formatSessionDate(session.date)}
                                        </span>
                                        <span className="text-sm text-gray-500 dark:text-gray-400">
                                            {formatSetSummary(session.sets)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Empty state when no exercise and no most trained */}
            {!selectedExercise && mostTrainedExercises.length === 0 && (
                <div className="card text-center py-8 text-gray-500">
                    No workout history yet. Complete some workouts to see your progress!
                </div>
            )}
        </div>
    );
}
