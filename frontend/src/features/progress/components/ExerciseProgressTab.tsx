import { useState, useRef, useEffect } from 'react';
import { useExerciseSuggestions } from '../../../shared/api/queries';
import { useProgressData } from '../hooks/useProgressData';
import { ProgressChart } from './ProgressChart';

function formatSessionDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}


type ChartMetric = 'volume' | '1rm' | 'weight';

export function ExerciseProgressTab() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [chartMetric, setChartMetric] = useState<ChartMetric>('1rm');
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const { data: suggestions } = useExerciseSuggestions(searchQuery);
    const {
        isLoading,
        error,
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

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!showSuggestions) return;

        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [showSuggestions]);

    const handleSelectExercise = (name: string) => {
        setSelectedExercise(name);
        setSearchQuery('');
        setShowSuggestions(false);
    };

    const exerciseHistory = selectedExercise ? getExerciseHistory(selectedExercise) : [];
    const chartData = exerciseHistory.map(session => ({
        date: session.date,
        value: chartMetric === 'volume' ? session.bestVolume
            : chartMetric === '1rm' ? session.bestEstimated1RM
                : session.bestWeight,
    }));

    if (isLoading) {
        return (
            <div className="card text-center py-8 text-gray-500">
                Loading progress data...
            </div>
        );
    }

    if (error) {
        return (
            <div className="card text-center py-8">
                <p className="text-red-500">Failed to load progress data</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Search box */}
            <div className="card">
                <div className="relative" ref={dropdownRef}>
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
                        <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-surface-800
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

                        {/* Metric Toggle */}
                        <div className="flex justify-center mb-6">
                            <div className="inline-flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                {(['volume', '1rm', 'weight'] as const).map(metric => (
                                    <button
                                        key={metric}
                                        onClick={() => setChartMetric(metric)}
                                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors
                                            ${chartMetric === metric
                                                ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-white shadow-sm'
                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                            }`}
                                    >
                                        {metric === 'volume' ? 'Volume'
                                            : metric === '1rm' ? 'Est. 1RM'
                                                : 'Weight'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <ProgressChart
                            data={chartData}
                            exerciseName={selectedExercise}
                            metric={chartMetric}
                        />
                    </div>

                    {/* Session history list */}
                    {exerciseHistory.length > 0 && (
                        <div className="card">
                            <h3 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">
                                Session History
                            </h3>
                            <div className="space-y-3">
                                {exerciseHistory.slice().reverse().map((session) => (
                                    <div
                                        key={session.sessionId}
                                        className="py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                                    >
                                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            {formatSessionDate(session.date)}
                                        </div>
                                        <div className="space-y-0.5">
                                            {session.sets.map((set, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`text-xs flex items-center gap-2 ${
                                                        set.dropIndex > 0
                                                            ? 'ml-4 text-orange-600 dark:text-orange-400'
                                                            : 'text-gray-600 dark:text-gray-400'
                                                    }`}
                                                >
                                                    <span className="w-12">
                                                        {set.dropIndex > 0 ? `Drop ${set.dropIndex}` : `Set ${set.setNumber}`}
                                                    </span>
                                                    <span>{set.weight} lbs x {set.reps}</span>
                                                    {set.perceivedEffort && (
                                                        <span className="text-gray-400">RPE {set.perceivedEffort}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
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
