import type { ExerciseSession } from '../hooks/useProgressData';
import { ProgressChart } from './ProgressChart';
import { DetailHeader, SegmentedControl, formatSessionDate } from './detailParts';
import { formatWeight } from '../../../shared/utils/format';
import { effectiveWeight } from '../../../shared/lib/effectiveWeight';

export type ChartMetric = 'volume' | '1rm' | 'weight';

const METRIC_LABELS: Record<ChartMetric, string> = {
    volume: 'Volume',
    '1rm': 'Est. 1RM',
    weight: 'Weight',
};

interface StrengthDetailProps {
    name: string;
    history: ExerciseSession[];
    metric: ChartMetric;
    onMetricChange: (metric: ChartMetric) => void;
    onClear: () => void;
    bodyweight: number | null;
}

export function StrengthDetail({ name, history, metric, onMetricChange, onClear, bodyweight }: StrengthDetailProps) {
    const chartData = history.map(session => ({
        date: session.date,
        value: metric === 'volume' ? session.bestVolume
            : metric === '1rm' ? session.bestEstimated1RM
                : session.bestWeight,
    }));

    return (
        <>
            <div className="card">
                <DetailHeader name={name} onClear={onClear} />

                <div className="flex justify-center mb-6">
                    <SegmentedControl
                        options={(['volume', '1rm', 'weight'] as const).map(m => ({ value: m, label: METRIC_LABELS[m] }))}
                        value={metric}
                        onChange={onMetricChange}
                    />
                </div>

                <ProgressChart data={chartData} exerciseName={name} metric={metric} />
            </div>

            {history.length > 0 && (
                <div className="card">
                    <h3 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">
                        Session History
                    </h3>
                    <div className="space-y-3">
                        {history.slice().reverse().map((session) => (
                            <div
                                key={session.sessionId}
                                className="py-2 border-b border-gray-100 dark:border-surface-700 last:border-0"
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
                                            <span>
                                                {formatWeight(set.weight)} lbs x {set.reps}
                                                {set.weight < 0 && bodyweight != null && (
                                                    <span className="text-gray-400"> · {effectiveWeight(set.weight, bodyweight)} eff</span>
                                                )}
                                            </span>
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
    );
}
