export function downsampleHr(
  samples: { ts: number; bpm: number }[],
  sessionStartMs: number,
  bucketSec = 5,
  cap = 2000,
): { t: number[]; b: number[] } | null {
  if (samples.length === 0) return null;
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const s of samples) {
    const t = Math.floor((s.ts - sessionStartMs) / 1000 / bucketSec) * bucketSec;
    if (t < 0) continue;
    const cur = buckets.get(t);
    if (cur) {
      cur.sum += s.bpm;
      cur.count += 1;
    } else {
      buckets.set(t, { sum: s.bpm, count: 1 });
    }
  }
  if (buckets.size === 0) return null;
  const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]).slice(0, cap);
  return {
    t: sorted.map(([t]) => t),
    b: sorted.map(([, v]) => Math.round(v.sum / v.count)),
  };
}

export function parseSeries(json: string | null): { t: number[]; b: number[] } | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed?.t) && Array.isArray(parsed?.b) && parsed.t.length === parsed.b.length) {
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}
