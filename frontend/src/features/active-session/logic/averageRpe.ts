export function averageRpe(
  sets: Array<{ perceivedEffort: number | null; dropIndex: number }>
): number | null {
  let sum = 0;
  let count = 0;
  for (const s of sets) {
    if (s.dropIndex !== 0) continue;
    if (s.perceivedEffort == null) continue;
    sum += s.perceivedEffort;
    count += 1;
  }
  return count === 0 ? null : sum / count;
}
