import type { LiftStatusKind } from '../../../shared/lib/liftTrend';
import { formatWeight } from '../../../shared/utils/format';
import {
    formatChange,
    shortDate,
    statusLabel,
    summaryLine,
    type LiftOverview as Overview,
} from '../logic/liftOverview';
import { Sparkline } from './Sparkline';

// Progressing is teal, stalled amber, everything else neutral. Never red: a stall is
// information, not an error.
const CHIP: Partial<Record<LiftStatusKind, string>> = {
    progressing: 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
    stalled: 'bg-accent-100 text-accent-800 dark:bg-accent-900/40 dark:text-accent-300',
};
const CHIP_NEUTRAL = 'bg-gray-100 text-gray-600 dark:bg-surface-700 dark:text-gray-300';

const TREND: Partial<Record<LiftStatusKind, string>> = {
    progressing: 'text-primary-600 dark:text-primary-400',
    stalled: 'text-accent-600 dark:text-accent-400',
};
const TREND_NEUTRAL = 'text-gray-400 dark:text-gray-500';

interface LiftOverviewProps {
    overview: Overview;
    today: string;
    onSelect: (name: string) => void;
}

export function LiftOverview({ overview, today, onSelect }: LiftOverviewProps) {
    if (overview.rows.length === 0) return null;

    return (
        <div className="card !p-0 overflow-hidden">
            <div className="px-4 pt-4 pb-2">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">Your lifts</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-x-1">
                    {summaryLine(overview.counts).split(' · ').map((part, i) => (
                        <span key={part} className="whitespace-nowrap">{i > 0 && '· '}{part}</span>
                    ))}
                </p>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-surface-700">
                {overview.rows.map((row) => {
                    const kind = row.status.kind;
                    const trend = TREND[kind] ?? TREND_NEUTRAL;
                    return (
                        <li key={row.name}>
                            <button
                                onClick={() => onSelect(row.name)}
                                className="w-full text-left px-4 py-3 flex items-center gap-3 min-h-[44px]
                                    hover:bg-gray-50 dark:hover:bg-surface-700/50 transition-colors"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100 break-words leading-snug">
                                        {row.name}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${CHIP[kind] ?? CHIP_NEUTRAL}`}>
                                            {statusLabel(row.status, today)}
                                        </span>
                                        {row.lastSet && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
                                                {formatWeight(row.lastSet.weight)} lbs × {row.lastSet.reps}
                                                {/* The inactive chip already carries the date */}
                                                {kind !== 'inactive' && ` · ${shortDate(row.lastSet.completedAt, today)}`}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className={`shrink-0 flex flex-col items-end gap-0.5 ${trend}`}>
                                    <Sparkline values={row.spark} />
                                    <span className="text-xs tabular-nums font-medium h-4">
                                        {row.changePct != null ? formatChange(row.changePct) : ''}
                                    </span>
                                </div>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
