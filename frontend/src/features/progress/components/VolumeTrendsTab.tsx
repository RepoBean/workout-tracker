import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
} from 'recharts';
import { useProgressData } from '../hooks/useProgressData';

interface ComparisonCardProps {
    title: string;
    currentLabel: string;
    currentValue: number;
    previousLabel: string;
    previousValue: number;
}

function ComparisonCard({
    title,
    currentLabel,
    currentValue,
    previousLabel,
    previousValue,
}: ComparisonCardProps) {
    const percentChange = previousValue > 0
        ? ((currentValue - previousValue) / previousValue) * 100
        : currentValue > 0 ? 100 : 0;

    const isIncrease = percentChange >= 0;
    const arrow = isIncrease ? '▲' : '▼';
    const colorClass = isIncrease
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400';

    return (
        <div className="card">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                {title}
            </h3>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{currentLabel}</p>
                    <p className="text-xl font-bold text-gray-800 dark:text-white">
                        {currentValue.toLocaleString()} lbs
                    </p>
                    {previousValue > 0 && (
                        <p className={`text-sm font-medium ${colorClass}`}>
                            {arrow} {Math.abs(percentChange).toFixed(1)}%
                        </p>
                    )}
                </div>
                <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{previousLabel}</p>
                    <p className="text-xl font-bold text-gray-600 dark:text-gray-300">
                        {previousValue.toLocaleString()} lbs
                    </p>
                </div>
            </div>
        </div>
    );
}

export function VolumeTrendsTab() {
    const {
        isLoading,
        error,
        weeklyVolumes,
        thisWeekVolume,
        lastWeekVolume,
        thisMonthVolume,
        lastMonthVolume,
    } = useProgressData();

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

    const isDark = document.documentElement.classList.contains('dark');

    // Check if there's any workout data
    const hasData = weeklyVolumes.some(w => w.totalVolume > 0);

    if (!hasData) {
        return (
            <div className="card text-center py-8 text-gray-500 dark:text-gray-400">
                No workout data yet
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Week comparison */}
            <ComparisonCard
                title="This Week vs Last Week"
                currentLabel="This Week"
                currentValue={thisWeekVolume}
                previousLabel="Last Week"
                previousValue={lastWeekVolume}
            />

            {/* Month comparison */}
            <ComparisonCard
                title="This Month vs Last Month"
                currentLabel="This Month"
                currentValue={thisMonthVolume}
                previousLabel="Last Month"
                previousValue={lastMonthVolume}
            />

            {/* Weekly volume chart */}
            <div className="card">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                    Weekly Volume (Last 12 Weeks)
                </h3>
                <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyVolumes} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <XAxis
                                dataKey="weekLabel"
                                tick={{ fontSize: 10 }}
                                stroke="#9ca3af"
                                interval={1}
                            />
                            <YAxis
                                tick={{ fontSize: 10 }}
                                stroke="#9ca3af"
                                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                            />
                            <Tooltip
                                formatter={(value: number | undefined) => {
                                    if (value !== undefined) {
                                        return [`${value.toLocaleString()} lbs`, 'Volume'];
                                    }
                                    return undefined;
                                }}
                                labelFormatter={(label) => `Week of ${label}`}
                                contentStyle={{
                                    backgroundColor: isDark ? '#1f2937' : '#fff',
                                    border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                                    borderRadius: '8px',
                                    color: isDark ? '#f3f4f6' : '#111827',
                                    fontSize: '14px',
                                }}
                            />
                            <Bar
                                dataKey="totalVolume"
                                fill="#4f46e5"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
