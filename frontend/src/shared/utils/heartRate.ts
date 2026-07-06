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

// Persisted-sample codec — raw samples delta-encoded against a base timestamp
// so the per-session localStorage payload stays compact (~100 KB for 2 h at
// 1 Hz). Raw, not downsampled: the completion avg/min/max must stay exact.
export function encodeHrSamples(
  samples: { ts: number; bpm: number }[],
  base: number,
): string {
  return JSON.stringify({ v: 1, base, s: samples.map((s) => [s.ts - base, s.bpm]) });
}

export function decodeHrSamples(json: string | null): { ts: number; bpm: number }[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed?.v !== 1 || !Number.isFinite(parsed?.base) || !Array.isArray(parsed?.s)) {
      return null;
    }
    const out: { ts: number; bpm: number }[] = [];
    for (const entry of parsed.s) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const [dt, bpm] = entry;
      if (!Number.isFinite(dt) || !Number.isFinite(bpm)) continue;
      out.push({ ts: parsed.base + dt, bpm });
    }
    return out;
  } catch {
    return null;
  }
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
