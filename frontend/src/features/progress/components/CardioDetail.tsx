import type { CardioExerciseSession } from '../hooks/useProgressData';
import { ProgressChart } from './ProgressChart';
import { DetailHeader, SegmentedControl, formatSessionDate } from './detailParts';
import { formatMMSS } from '../../../shared/utils/format';

export type CardioMetric = 'pace' | 'distance' | 'duration' | 'hr';

const METRIC_LABELS: Record<CardioMetric, string> = {
    pace: 'Pace',
    distance: 'Distance',
    duration: 'Duration',
    hr: 'Avg HR',
};

interface CardioDetailProps {
    name: string;
    history: CardioExerciseSession[];
    metric: CardioMetric;
    onMetricChange: (metric: CardioMetric) => void;
    onClear: () => void;
}

export function CardioDetail({ name, history, metric, onMetricChange, onClear }: CardioDetailProps) {
    // Disable pace metric when any session lacks distance — pace is undefined.
    const paceDisabled = history.some(s => s.totalDistance === 0);
    const effectiveMetric: CardioMetric = paceDisabled && metric === 'pace' ? 'distance' : metric;

    const chartData = history
        .map(session => {
            let value: number | null;
            switch (effectiveMetric) {
                case 'pace': value = session.avgPaceMph; break;
                case 'distance': value = session.totalDistance > 0 ? session.totalDistance : null; break;
                case 'duration': value = session.totalDurationSec > 0 ? session.totalDurationSec : null; break;
                case 'hr': value = session.avgHr; break;
            }
            return { date: session.date, value };
        })
        .filter((p): p is { date: string; value: number } => p.value != null);

    const formatTooltip = (v: number) => {
        switch (effectiveMetric) {
            case 'pace': return `${v.toFixed(1)} mph`;
            case 'distance': return `${v.toFixed(2)} mi`;
            case 'duration': return formatMMSS(Math.round(v));
            case 'hr': return `${Math.round(v)} bpm`;
        }
    };
    const formatAxis = effectiveMetric === 'duration'
        ? (v: number) => formatMMSS(Math.round(v))
        : undefined;

    return (
        <>
            <div className="card">
                <DetailHeader name={name} onClear={onClear} />

                <div className="flex justify-center mb-2">
                    <SegmentedControl
                        options={(['pace', 'distance', 'duration', 'hr'] as const).map(m => ({
                            value: m,
                            label: METRIC_LABELS[m],
                            disabled: m === 'pace' && paceDisabled,
                        }))}
                        value={effectiveMetric}
                        onChange={onMetricChange}
                    />
                </div>
                {paceDisabled && (
                    <p className="text-xs text-center text-gray-400 dark:text-gray-500 mb-4">
                        Pace unavailable — at least one session has no distance logged
                    </p>
                )}
                {!paceDisabled && <div className="mb-4" />}

                <ProgressChart
                    data={chartData}
                    exerciseName={name}
                    metric="weight"
                    formatTooltip={formatTooltip}
                    formatAxisTick={formatAxis}
                />
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
    );
}
