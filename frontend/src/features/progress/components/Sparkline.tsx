/**
 * Tiny trend line as inline SVG — the overview shows ~20 of these at once, which is
 * far too many recharts instances. Strokes with currentColor, so the caller colours it.
 */
const W = 64;
const H = 24;
const PAD = 3;

export function Sparkline({ values, className = '' }: { values: number[]; className?: string }) {
    if (values.length === 0) return <div style={{ width: W, height: H }} aria-hidden />;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const x = (i: number) => (values.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (values.length - 1));
    const y = (v: number) => (span === 0 ? H / 2 : H - PAD - ((v - min) / span) * (H - 2 * PAD));
    const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const last = values.length - 1;

    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden>
            {values.length > 1 && (
                <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            )}
            <circle cx={x(last)} cy={y(values[last])} r={2.5} fill="currentColor" />
        </svg>
    );
}
