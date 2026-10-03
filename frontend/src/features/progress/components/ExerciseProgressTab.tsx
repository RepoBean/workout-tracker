import { useState, useRef, useEffect, useMemo } from 'react';
import { useProgressData, type ProgressMode } from '../hooks/useProgressData';
import { useUserProfile } from '../../../shared/context/UserProfileContext';
import { LiftOverview } from './LiftOverview';
import { StrengthDetail, type ChartMetric } from './StrengthDetail';
import { CardioDetail, type CardioMetric } from './CardioDetail';

type Mode = ProgressMode;

const QUICK_SELECT_COLLAPSED = 8;

export function ExerciseProgressTab() {
    const [mode, setMode] = useState<Mode>('strength');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [chartMetric, setChartMetric] = useState<ChartMetric>('1rm');
    const [cardioMetric, setCardioMetric] = useState<CardioMetric>('pace');
    const [showAllQuick, setShowAllQuick] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const {
        isLoading,
        error,
        hasStrengthHistory,
        liftOverview,
        today,
        searchExercises,
        getExerciseHistory,
        hasCardioHistory,
        mostTrainedCardio,
        activeCardioExercises,
        getCardioExerciseHistory,
    } = useProgressData();
    const { profile: { bodyweight } } = useUserProfile();

    // Local, catalog-aware search over what this mode can chart (logic/exerciseSearch.ts)
    const filteredSuggestions = useMemo(
        () => searchExercises(searchQuery, mode),
        [searchExercises, searchQuery, mode]
    );

    const handleModeChange = (newMode: Mode) => {
        if (newMode === mode) return;
        setMode(newMode);
        setSelectedExercise(null);
        setSearchQuery('');
        setShowSuggestions(false);
        setShowAllQuick(false);
    };

    useEffect(() => {
        setShowSuggestions(filteredSuggestions.length > 0);
    }, [filteredSuggestions]);

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

    // Cardio keeps the chip landing; strength lands on the per-lift overview.
    const quickSelectNames = mode === 'cardio' ? activeCardioExercises : [];
    const visibleQuickSelect = showAllQuick
        ? quickSelectNames
        : quickSelectNames.slice(0, QUICK_SELECT_COLLAPSED);
    const modeMostTrained = mode === 'cardio' ? mostTrainedCardio : [];
    const modeHasHistory = mode === 'cardio' ? hasCardioHistory : hasStrengthHistory;

    return (
        <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex justify-center">
                <div className="inline-flex bg-gray-100 dark:bg-surface-800 rounded-lg p-1">
                    {(['strength', 'cardio'] as const).map(m => (
                        <button
                            key={m}
                            onClick={() => handleModeChange(m)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors min-w-[90px]
                                ${mode === m
                                    ? 'bg-white dark:bg-surface-600 text-primary-600 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            {m === 'strength' ? 'Strength' : 'Cardio'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Search box */}
            <div className="card">
                <div className="relative" ref={dropdownRef}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => {
                            if (filteredSuggestions.length > 0) setShowSuggestions(true);
                        }}
                        placeholder={mode === 'cardio' ? 'Search cardio exercise...' : 'Search exercise...'}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-surface-900
                       dark:border-surface-800 dark:text-white text-sm"
                    />

                    {/* Autocomplete suggestions */}
                    {showSuggestions && filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-surface-800
                            border dark:border-surface-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {filteredSuggestions.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100
                             dark:hover:bg-surface-700 transition-colors min-h-[44px] flex items-center"
                                    onClick={() => handleSelectExercise(suggestion)}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Quick select chips for active program exercises */}
                {quickSelectNames.length > 0 && (
                    <div className="mt-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Quick select:</p>
                        <div className="flex flex-wrap gap-2">
                            {visibleQuickSelect.map((name) => (
                                <button
                                    key={name}
                                    onClick={() => handleSelectExercise(name)}
                                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors min-h-[44px]
                    ${selectedExercise === name
                                            ? 'bg-primary-600 text-white'
                                            : 'bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-600'
                                        }`}
                                >
                                    {name}
                                </button>
                            ))}
                            {quickSelectNames.length > QUICK_SELECT_COLLAPSED && (
                                <button
                                    onClick={() => setShowAllQuick(v => !v)}
                                    className="px-3 py-2 rounded-full text-sm font-medium min-h-[44px]
                                        text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-surface-700"
                                >
                                    {showAllQuick ? 'Show less' : `Show all (${quickSelectNames.length})`}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Most trained (when no exercise selected) */}
            {!selectedExercise && modeMostTrained.length > 0 && (
                <div className="card">
                    <h3 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">Most Trained</h3>
                    <div className="flex flex-wrap gap-2">
                        {modeMostTrained.map((name) => (
                            <button
                                key={name}
                                onClick={() => handleSelectExercise(name)}
                                className="px-3 py-2 rounded-full text-sm font-medium bg-gray-100
                           dark:bg-surface-700 text-gray-700 dark:text-gray-300
                           hover:bg-gray-200 dark:hover:bg-surface-600 transition-colors min-h-[44px]"
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Strength landing: every lift's trend at a glance */}
            {!selectedExercise && mode === 'strength' && hasStrengthHistory && (
                <LiftOverview overview={liftOverview} today={today} onSelect={handleSelectExercise} />
            )}

            {selectedExercise && mode === 'strength' && (
                <StrengthDetail
                    name={selectedExercise}
                    history={getExerciseHistory(selectedExercise)}
                    metric={chartMetric}
                    onMetricChange={setChartMetric}
                    onClear={() => setSelectedExercise(null)}
                    bodyweight={bodyweight}
                />
            )}

            {selectedExercise && mode === 'cardio' && (
                <CardioDetail
                    name={selectedExercise}
                    history={getCardioExerciseHistory(selectedExercise)}
                    metric={cardioMetric}
                    onMetricChange={setCardioMetric}
                    onClear={() => setSelectedExercise(null)}
                />
            )}

            {/* Empty state when this mode has no logged history at all */}
            {!selectedExercise && !modeHasHistory && (
                <div className="card text-center py-8 text-gray-500">
                    {mode === 'cardio'
                        ? 'No cardio sessions yet. Log some cardio to see your progress!'
                        : 'No workout history yet. Complete some workouts to see your progress!'}
                </div>
            )}
        </div>
    );
}
