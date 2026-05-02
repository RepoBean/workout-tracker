import { useState, useRef, useEffect, useMemo } from 'react';
import { useExerciseSuggestions } from '../../../shared/api/queries';
import { useProgressData } from '../hooks/useProgressData';
import { ProgressChart } from './ProgressChart';
import { formatMMSS } from '../../../shared/utils/format';

function formatSessionDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}


type Mode = 'strength' | 'cardio';
type ChartMetric = 'volume' | '1rm' | 'weight';
type CardioMetric = 'pace' | 'distance' | 'duration' | 'hr';

const CARDIO_METRIC_LABELS: Record<CardioMetric, string> = {
    pace: 'Pace',
    distance: 'Distance',
    duration: 'Duration',
    hr: 'Avg HR',
};

export function ExerciseProgressTab() {
    const [mode, setMode] = useState<Mode>('strength');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [chartMetric, setChartMetric] = useState<ChartMetric>('1rm');
    const [cardioMetric, setCardioMetric] = useState<CardioMetric>('pace');
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const { data: suggestions } = useExerciseSuggestions(searchQuery);
    const {
        isLoading,
        error,
        mostTrainedExercises,
        activeExercises,
        getExerciseHistory,
        activeCardioExercises,
        allCardioExerciseNames,
        getCardioExerciseHistory,
    } = useProgressData();

    // Filter autocomplete suggestions to cardio-only when in cardio mode.
    const cardioNameSet = useMemo(
        () => new Set(allCardioExerciseNames),
        [allCardioExerciseNames]
    );
    const filteredSuggestions = mode === 'cardio'
        ? (suggestions ?? []).filter(name => cardioNameSet.has(name))
        : (suggestions ?? []);
    const cardioMostTrained = useMemo(
        () => mostTrainedExercises.filter(name => cardioNameSet.has(name)),
        [mostTrainedExercises, cardioNameSet]
    );
    const strengthMostTrained = useMemo(
        () => mostTrainedExercises.filter(name => !cardioNameSet.has(name)),
        [mostTrainedExercises, cardioNameSet]
    );

    const handleModeChange = (newMode: Mode) => {
        if (newMode === mode) return;
        setMode(newMode);
        setSelectedExercise(null);
        setSearchQuery('');
        setShowSuggestions(false);
    };

    useEffect(() => {
        if (filteredSuggestions.length > 0 && searchQuery.length >= 2) {
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    }, [filteredSuggestions, searchQuery]);

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

    const exerciseHistory = (mode === 'strength' && selectedExercise)
        ? getExerciseHistory(selectedExercise)
        : [];
    const chartData = exerciseHistory.map(session => ({
        date: session.date,
        value: chartMetric === 'volume' ? session.bestVolume
            : chartMetric === '1rm' ? session.bestEstimated1RM
                : session.bestWeight,
    }));

    const cardioHistory = (mode === 'cardio' && selectedExercise)
        ? getCardioExerciseHistory(selectedExercise)
        : [];
    // Disable pace metric when any session lacks distance — pace is undefined.
    const paceDisabled = cardioHistory.some(s => s.totalDistance === 0);
    const effectiveCardioMetric: CardioMetric = paceDisabled && cardioMetric === 'pace'
        ? 'distance'
        : cardioMetric;
    const cardioChartData = cardioHistory
        .map(session => {
            let value: number | null;
            switch (effectiveCardioMetric) {
                case 'pace': value = session.avgPaceMph; break;
                case 'distance': value = session.totalDistance > 0 ? session.totalDistance : null; break;
                case 'duration': value = session.totalDurationSec > 0 ? session.totalDurationSec : null; break;
                case 'hr': value = session.avgHr; break;
            }
            return { date: session.date, value };
        })
        .filter((p): p is { date: string; value: number } => p.value != null);

    const cardioFormatTooltip = (v: number) => {
        switch (effectiveCardioMetric) {
            case 'pace': return `${v.toFixed(1)} mph`;
            case 'distance': return `${v.toFixed(2)} mi`;
            case 'duration': return formatMMSS(Math.round(v));
            case 'hr': return `${Math.round(v)} bpm`;
        }
    };
    const cardioFormatAxis = effectiveCardioMetric === 'duration'
        ? (v: number) => formatMMSS(Math.round(v))
        : undefined;

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

    const quickSelectNames = mode === 'cardio' ? activeCardioExercises : activeExercises;
    const modeMostTrained = mode === 'cardio' ? cardioMostTrained : strengthMostTrained;

    return (
        <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex justify-center">
                <div className="inline-flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    {(['strength', 'cardio'] as const).map(m => (
                        <button
                            key={m}
                            onClick={() => handleModeChange(m)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors min-w-[90px]
                                ${mode === m
                                    ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-white shadow-sm'
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
                            if (filteredSuggestions.length > 0 && searchQuery.length >= 2) {
                                setShowSuggestions(true);
                            }
                        }}
                        placeholder={mode === 'cardio' ? 'Search cardio exercise...' : 'Search exercise...'}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700
                       dark:border-gray-600 dark:text-white text-sm"
                    />

                    {/* Autocomplete suggestions */}
                    {showSuggestions && filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-surface-800
                            border dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {filteredSuggestions.map((suggestion, i) => (
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
                {quickSelectNames.length > 0 && (
                    <div className="mt-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Quick select:</p>
                        <div className="flex flex-wrap gap-2 overflow-x-auto">
                            {quickSelectNames.slice(0, 8).map((name) => (
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
            {!selectedExercise && modeMostTrained.length > 0 && (
                <div className="card">
                    <h3 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">Most Trained</h3>
                    <div className="flex flex-wrap gap-2">
                        {modeMostTrained.map((name) => (
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

            {/* Strength: chart + session list */}
            {selectedExercise && mode === 'strength' && (
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

            {/* Cardio: chart + session list */}
            {selectedExercise && mode === 'cardio' && (
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

                        <div className="flex justify-center mb-2">
                            <div className="inline-flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                {(['pace', 'distance', 'duration', 'hr'] as const).map(metric => {
                                    const disabled = metric === 'pace' && paceDisabled;
                                    const active = effectiveCardioMetric === metric;
                                    return (
                                        <button
                                            key={metric}
                                            onClick={() => !disabled && setCardioMetric(metric)}
                                            disabled={disabled}
                                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                                                ${active
                                                    ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-white shadow-sm'
                                                    : disabled
                                                        ? 'text-gray-300 dark:text-gray-500 cursor-not-allowed'
                                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                                }`}
                                        >
                                            {CARDIO_METRIC_LABELS[metric]}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {paceDisabled && (
                            <p className="text-xs text-center text-gray-400 dark:text-gray-500 mb-4">
                                Pace unavailable — at least one session has no distance logged
                            </p>
                        )}
                        {!paceDisabled && <div className="mb-4" />}

                        <ProgressChart
                            data={cardioChartData}
                            exerciseName={selectedExercise}
                            metric="weight"
                            formatTooltip={cardioFormatTooltip}
                            formatAxisTick={cardioFormatAxis}
                        />
                    </div>

                    {/* Session history list */}
                    {cardioHistory.length > 0 && (
                        <div className="card">
                            <h3 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">
                                Session History
                            </h3>
                            <div className="space-y-3">
                                {cardioHistory.slice().reverse().map((session) => (
                                    <div
                                        key={session.sessionId}
                                        className="py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                                    >
                                        <div className="flex items-baseline justify-between mb-1">
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                {formatSessionDate(session.date)}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                                                {formatMMSS(session.totalDurationSec)}
                                                {session.totalDistance > 0 && (
                                                    <> · {session.totalDistance.toFixed(2)} mi</>
                                                )}
                                                {session.avgPaceMph != null && (
                                                    <> · {session.avgPaceMph.toFixed(1)} mph</>
                                                )}
                                                {session.avgHr != null && (
                                                    <> · <span className="text-red-500 dark:text-red-400">♥ {session.avgHr}</span></>
                                                )}
                                            </span>
                                        </div>
                                        {session.sets.length > 1 && (
                                            <div className="space-y-0.5">
                                                {session.sets.map((set, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="text-xs flex items-center gap-2 text-gray-600 dark:text-gray-400"
                                                    >
                                                        <span className="w-12">Set {set.setNumber}</span>
                                                        <span className="tabular-nums">
                                                            {formatMMSS(set.durationSec)}
                                                            {set.distance != null && set.distance > 0 && (
                                                                <> · {set.distance.toFixed(2)} mi</>
                                                            )}
                                                        </span>
                                                        {set.heartRateAvg != null && (
                                                            <span className="text-red-500 dark:text-red-400">♥ {set.heartRateAvg}</span>
                                                        )}
                                                        {set.perceivedEffort && (
                                                            <span className="text-gray-400">RPE {set.perceivedEffort}</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Empty state when no exercise and nothing to suggest in this mode */}
            {!selectedExercise && modeMostTrained.length === 0 && quickSelectNames.length === 0 && (
                <div className="card text-center py-8 text-gray-500">
                    {mode === 'cardio'
                        ? 'No cardio sessions yet. Log some cardio to see your progress!'
                        : 'No workout history yet. Complete some workouts to see your progress!'}
                </div>
            )}
        </div>
    );
}
