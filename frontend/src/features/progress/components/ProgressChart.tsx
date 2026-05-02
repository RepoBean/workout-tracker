import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
} from 'recharts';

interface ChartDataPoint {
    date: string;
    value: number;
    displayDate: string;
}

interface ProgressChartProps {
    data: Array<{ date: string; value: number }>;
    exerciseName: string;
    metric: 'volume' | '1rm' | 'weight';
    // Override the default `${value} ${unit}` tooltip — cardio uses this to
    // append units like "mi" / "mph" / "bpm" or render duration as m:ss.
    formatTooltip?: (value: number) => string;
    // Override the default Y-axis tick label. Mostly only needed for duration
    // where raw seconds should render as m:ss.
    formatAxisTick?: (value: number) => string;
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatShortDate(dateString: string): string {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function ProgressChart({ data, exerciseName, metric, formatTooltip, formatAxisTick }: ProgressChartProps) {
    const isDark = document.documentElement.classList.contains('dark');

    if (data.length === 0) {
        return (
            <div className="h-[250px] flex items-center justify-center text-gray-500 dark:text-gray-400">
                No data for this exercise yet
            </div>
        );
    }

    const chartData: ChartDataPoint[] = data.map(d => ({
        date: d.date,
        value: d.value,
        displayDate: formatShortDate(d.date),
    }));

    const unit = metric === 'volume' ? 'vol' : 'lbs';

    return (
        <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <XAxis
                        dataKey="displayDate"
                        tick={{ fontSize: 12 }}
                        stroke="#9ca3af"
                    />
                    <YAxis
                        tick={{ fontSize: 12 }}
                        stroke="#9ca3af"
                        domain={['auto', 'auto']}
                        tickFormatter={(value) => formatAxisTick ? formatAxisTick(value) : `${value}`}
                    />
                    <Tooltip
                        formatter={(value: number | undefined) => {
                            if (value === undefined) return undefined;
                            const display = formatTooltip
                                ? formatTooltip(value)
                                : `${value} ${unit}`;
                            return [display, exerciseName];
                        }}
                        labelFormatter={(label, payload) => {
                            if (payload && payload[0]) {
                                return formatDate(payload[0].payload.date);
                            }
                            return label;
                        }}
                        contentStyle={{
                            backgroundColor: isDark ? '#1f2937' : '#fff',
                            border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                            borderRadius: '8px',
                            color: isDark ? '#f3f4f6' : '#111827',
                            fontSize: '14px',
                        }}
                    />
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#0d9488"
                        strokeWidth={2}
                        dot={{ fill: '#0d9488', strokeWidth: 0, r: 4 }}
                        activeDot={{ r: 6, fill: '#0d9488' }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
