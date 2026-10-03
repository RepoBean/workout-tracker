// Small pieces shared by the strength and cardio detail views.

import { useState } from 'react';
import { CHART_RANGES, defaultRange, inRange, type ChartRange } from '../logic/chartRange';

/** "Oct 2", or "Dec 20, 2025" outside the current year (All spans years). */
export function formatSessionDate(dateString: string): string {
    const date = new Date(dateString);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString('en-US', sameYear
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function DetailHeader({ name, onClear }: { name: string; onClear: () => void }) {
    return (
        <div className="flex items-start justify-between gap-3 mb-4">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 min-w-0 break-words">
                {name}
            </h3>
            <button
                onClick={onClear}
                className="shrink-0 text-sm text-primary-600 hover:text-primary-700"
            >
                Clear
            </button>
        </div>
    );
}

interface SegmentedControlProps<T extends string> {
    options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
    value: T;
    onChange: (value: T) => void;
    size?: 'md' | 'sm';
}

export function SegmentedControl<T extends string>({ options, value, onChange, size = 'md' }: SegmentedControlProps<T>) {
    const pad = size === 'sm' ? 'px-3 py-1 text-xs' : 'px-3 py-1.5 text-sm';
    return (
        <div className="inline-flex bg-gray-100 dark:bg-surface-900 rounded-lg p-1">
            {options.map(({ value: v, label, disabled }) => (
                <button
                    key={v}
                    onClick={() => !disabled && onChange(v)}
                    disabled={disabled}
                    className={`${pad} font-medium rounded-md transition-colors
                        ${value === v
                            ? 'bg-white dark:bg-surface-700 text-primary-600 dark:text-white shadow-sm'
                            : disabled
                                ? 'text-gray-300 dark:text-gray-500 cursor-not-allowed'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

/**
 * Range state for a detail view: 6M by default, All when 6M holds fewer than 2 sessions.
 * The parent keys the detail view by lift, so the default is re-taken per lift.
 */
export function useChartRange<T extends { date: string }>(history: T[]) {
    const [now] = useState(() => new Date());
    const [range, setRange] = useState<ChartRange>(() => defaultRange(history, now));
    return { range, setRange, visible: inRange(history, range, now) };
}

export function RangeSelector({ value, onChange }: { value: ChartRange; onChange: (r: ChartRange) => void }) {
    return (
        <div className="flex justify-center mt-3">
            <SegmentedControl options={CHART_RANGES} value={value} onChange={onChange} size="sm" />
        </div>
    );
}
