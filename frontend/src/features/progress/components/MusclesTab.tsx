import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCatalog, useHistory } from '../../../shared/api/queries';
import { localToday } from '../../../shared/lib/liftTrend';
import { catalogMuscles, MUSCLE_GROUPS, muscleLabel } from '../../../shared/lib/muscles';
import {
    AVERAGE_WEEKS,
    BANDS,
    formatSetCount,
    muscleSummary,
    UNTRAINED_AFTER_DAYS,
    type Band,
    type MuscleRow,
} from '../../../shared/lib/muscleSets';

// Progress → Muscles (v4 C5): weekly working sets per muscle from the catalog's muscle tags.
// The band is a rule of thumb on the 4-week average; only "solid" gets the primary colour.
// Amber is reserved for the 14-day untrained flag, so small muscles that sit at "low" for
// good reason (forearms, obliques) never nag. Never red.

const BAND_LABEL: Record<Band, string> = { low: 'low', building: 'building', solid: 'solid', high: 'high' };

function MuscleRowView({ row, scaleMax }: { row: MuscleRow; scaleMax: number }) {
    const pct = (n: number) => `${Math.min(100, (n / scaleMax) * 100)}%`;
    const solid = row.band === 'solid';
    return (
        <li className="py-2">
            <div className="flex items-baseline gap-2">
                <span className="flex-1 min-w-0 font-medium text-gray-900 dark:text-gray-100">{muscleLabel(row.muscle)}</span>
                <span className="text-sm tabular-nums text-gray-900 dark:text-gray-100 w-10 text-right">
                    {formatSetCount(row.average)}
                </span>
                <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400 w-10 text-right">
                    {formatSetCount(row.thisWeek)}
                </span>
                <span
                    className={`w-16 text-right text-xs font-medium ${solid
                        ? 'text-primary-700 dark:text-primary-400'
                        : 'text-gray-500 dark:text-gray-400'}`}
                >
                    {row.band ? BAND_LABEL[row.band] : ''}
                </span>
            </div>
            <div className="relative mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-surface-700 overflow-hidden" aria-hidden="true">
                {/* The "solid" stretch of the scale, faintly */}
                <div
                    className="absolute inset-y-0 bg-primary-100 dark:bg-primary-900/40"
                    style={{ left: pct(BANDS.solid), width: `calc(${pct(BANDS.highAbove)} - ${pct(BANDS.solid)})` }}
                />
                <div
                    className={`absolute inset-y-0 left-0 rounded-full ${solid ? 'bg-primary-600' : 'bg-gray-400 dark:bg-gray-500'}`}
                    style={{ width: pct(row.average) }}
                />
            </div>
            {row.flagged && (
                <p className="mt-0.5 text-xs text-accent-700 dark:text-accent-400">
                    last trained {row.daysSince} d ago
                </p>
            )}
        </li>
    );
}

export function MusclesTab() {
    const { data: sessions, isLoading, error } = useHistory(1000, 0);
    const { data: entries, isLoading: catalogLoading } = useCatalog();
    // Fixed per mount, like the lift overview: statuses are relative to the day the page opened.
    const [today] = useState(localToday);

    const summary = useMemo(
        () => (sessions && entries ? muscleSummary(sessions, catalogMuscles(entries), today) : null),
        [sessions, entries, today]
    );

    if (isLoading || catalogLoading) {
        return <div className="card text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>;
    }
    if (error || !summary) {
        return (
            <div className="card text-center py-8">
                <p className="text-red-500">Failed to load progress data</p>
            </div>
        );
    }

    if (!summary.anyTags) {
        return (
            <div className="card text-center py-8 space-y-2">
                <p className="text-gray-700 dark:text-gray-300">No lifts are tagged with muscles yet.</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Tag them in{' '}
                    <Link to="/settings" className="text-primary-600 dark:text-primary-400 font-medium">
                        Settings → Exercise catalog
                    </Link>{' '}
                    (Manage → Muscles…).
                </p>
            </div>
        );
    }

    const byMuscle = new Map(summary.rows.map((r) => [r.muscle, r]));
    const trainedMax = Math.max(0, ...summary.rows.map((r) => r.average));
    const scaleMax = Math.max(BANDS.highAbove + 4, Math.ceil(trainedMax));
    const never = summary.rows.filter((r) => r.lastTrained === null);

    return (
        <div className="space-y-4">
            <div className="card">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Working sets per muscle per week. A secondary muscle counts ½. Bands on the {AVERAGE_WEEKS}-week
                    average are a rule of thumb: low &lt;{BANDS.building}, building {BANDS.building}–{BANDS.solid},
                    solid {BANDS.solid}–{BANDS.highAbove}, high &gt;{BANDS.highAbove}.
                </p>
                <div className="mt-3 flex items-baseline gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex-1" />
                    <span className="w-10 text-right">{AVERAGE_WEEKS}-wk avg</span>
                    <span className="w-10 text-right">this wk</span>
                    <span className="w-16" />
                </div>

                {MUSCLE_GROUPS.map((group) => {
                    const rows = group.muscles
                        .map((m) => byMuscle.get(m.id))
                        .filter((r): r is MuscleRow => r !== undefined && r.lastTrained !== null);
                    if (rows.length === 0) return null;
                    return (
                        <section key={group.group} className="mt-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {group.group}
                            </h3>
                            <ul className="divide-y divide-gray-100 dark:divide-surface-700">
                                {rows.map((row) => (
                                    <MuscleRowView key={row.muscle} row={row} scaleMax={scaleMax} />
                                ))}
                            </ul>
                        </section>
                    );
                })}

                {never.length > 0 && (
                    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                        Never trained (by your tags): {never.map((r) => muscleLabel(r.muscle)).join(', ')}
                    </p>
                )}
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Flagged when untrained for {UNTRAINED_AFTER_DAYS}+ days.
                </p>
            </div>

            {summary.untaggedSets > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 px-1">
                    {summary.untaggedSets} of {summary.totalSets} sets in the last {AVERAGE_WEEKS} weeks are on untagged
                    lifts —{' '}
                    <Link to="/settings" className="text-primary-600 dark:text-primary-400 font-medium">
                        tag them in Settings
                    </Link>
                    .
                </p>
            )}
        </div>
    );
}
