import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';

interface SetMarker {
  t: number;
  label: string;
}

interface Props {
  series: { t: number[]; b: number[] };
  setMarkers?: SetMarker[];
  mode?: 'continuous' | 'interval';
}

function formatMMSS(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SessionHRChart({ series, setMarkers = [], mode = 'interval' }: Props) {
  if (series.t.length === 0) return null;

  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  const data = series.t.map((t, i) => ({ t, b: series.b[i] }));

  return (
    <div className="h-[250px] -mx-2 mb-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
            tickFormatter={(s) => formatMMSS(s)}
          />
          <YAxis
            domain={[40, 'auto']}
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
          />
          <Tooltip
            formatter={(value: number | undefined) =>
              value !== undefined ? [`${value} bpm`, 'HR'] : undefined
            }
            labelFormatter={(label) => formatMMSS(Number(label))}
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
            dataKey="b"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {mode === 'interval' &&
            setMarkers.map((marker, i) => (
              <ReferenceLine
                key={`${marker.t}-${i}`}
                x={marker.t}
                stroke="#9ca3af"
                strokeDasharray="3 3"
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
