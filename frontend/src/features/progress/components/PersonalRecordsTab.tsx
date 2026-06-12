import { useState, useMemo } from 'react';
import { useProgressData, PersonalRecord } from '../hooks/useProgressData';

type SortMode = '1rm' | 'name' | 'recent';

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface PRCardProps {
    record: PersonalRecord;
}

function PRCard({ record }: PRCardProps) {
    return (
        <div
            className={`card ${record.isRecentPR ? 'border-l-4 border-primary-500' : ''}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        {record.isRecentPR && (
                            <span className="text-lg">🔥</span>
                        )}
                        <h3 className="font-bold text-gray-800 dark:text-white">
                            {record.exerciseName}
                        </h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Best: {record.bestVolumeWeight} lbs × {record.bestVolumeReps} = {record.bestVolume.toLocaleString()} vol
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Est. 1RM: <span className="font-semibold text-primary-600 dark:text-primary-400">{record.estimated1RM} lbs</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        {formatDate(record.bestVolumeDate)}
                    </p>
                </div>
                {record.isRecentPR && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 rounded-full">
                        RECENT
                    </span>
                )}
            </div>
        </div>
    );
}

export function PersonalRecordsTab() {
    const { isLoading, error, personalRecords } = useProgressData();
    const [sortMode, setSortMode] = useState<SortMode>('1rm');

    // Sort records based on current mode
    const sortedRecords = useMemo((): PersonalRecord[] => {
        if (!personalRecords.length) return [];

        const records = [...personalRecords];

        switch (sortMode) {
            case '1rm':
                // Already sorted by 1RM desc from hook
                return records.sort((a, b) => b.estimated1RM - a.estimated1RM);
            case 'name':
                return records.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
            case 'recent':
                return records.sort((a, b) =>
                    new Date(b.bestVolumeDate).getTime() - new Date(a.bestVolumeDate).getTime()
                );
            default:
                return records;
        }
    }, [personalRecords, sortMode]);

    if (isLoading) {
        return (
            <div className="card text-center py-8 text-gray-500 dark:text-gray-400">
                Loading...
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

    if (!personalRecords.length) {
        return (
            <div className="card text-center py-8 text-gray-500 dark:text-gray-400">
                No workout data yet — complete some workouts to see your PRs!
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header with sort buttons */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                    <span>🏆</span> Personal Records
                </h2>
            </div>

            {/* Sort toggles */}
            <div className="flex gap-2">
                <button
                    onClick={() => setSortMode('1rm')}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px]
                        ${sortMode === '1rm'
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700'
                        }`}
                >
                    1RM ▼
                </button>
                <button
                    onClick={() => setSortMode('name')}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px]
                        ${sortMode === 'name'
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700'
                        }`}
                >
                    Name
                </button>
                <button
                    onClick={() => setSortMode('recent')}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px]
                        ${sortMode === 'recent'
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700'
                        }`}
                >
                    Recent
                </button>
            </div>

            {/* PR cards */}
            <div className="space-y-3">
                {sortedRecords.map((record) => (
                    <PRCard key={record.exerciseName} record={record} />
                ))}
            </div>
        </div>
    );
}
