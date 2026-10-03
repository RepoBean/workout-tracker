// Local search for the Progress exercise picker. Candidates are the names Progress
// can actually chart (catalog-grouped history + active-program names for the current
// mode), so a pick never lands on "No data". Catalog aliases match too and resolve to
// the entry's name: typing "DB" finds "Low Incline Dumbbell Press" via its alias.

import type { CatalogEntry } from '../../../shared/api/types';

export const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;

/** Lower is better: name prefix, word prefix, name substring, alias match. */
function score(name: string, aliases: readonly string[], q: string): number | null {
    const lower = name.toLowerCase();
    if (lower.startsWith(q)) return 0;
    if (lower.split(/[\s\-/()]+/).some(word => word.startsWith(q))) return 1;
    if (lower.includes(q)) return 2;
    if (aliases.some(alias => alias.toLowerCase().includes(q))) return 3;
    return null;
}

export function searchExerciseNames(
    query: string,
    candidates: readonly string[],
    catalog: readonly CatalogEntry[] = [],
    limit: number = MAX_RESULTS,
): string[] {
    const q = query.trim().toLowerCase();
    if (q.length < MIN_QUERY_LENGTH) return [];

    const aliasesByName = new Map<string, string[]>();
    catalog.forEach(entry => aliasesByName.set(entry.name.toLowerCase(), entry.aliases));

    const hits: Array<{ name: string; rank: number }> = [];
    new Set(candidates).forEach(name => {
        const rank = score(name, aliasesByName.get(name.toLowerCase()) ?? [], q);
        if (rank != null) hits.push({ name, rank });
    });

    return hits
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
        .slice(0, limit)
        .map(hit => hit.name);
}
