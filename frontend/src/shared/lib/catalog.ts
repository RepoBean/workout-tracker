import type { CatalogEntry } from '../api/types';

/**
 * Exercise-catalog identity for history readers (Progress, the coach's all-time block).
 *
 * The server stamps every Set/Exercise with a catalogId derived from its name; merging
 * two spellings in Settings points both at one entry. Readers group by the entry's
 * name, so a renamed lift reads as one lift. A row whose catalog name isn't known
 * (catalog not loaded yet, optimistic set) falls back to its own name — with an empty
 * map that is exactly the old name-keyed behaviour.
 */

/** catalogId → display name. */
export type CatalogNames = ReadonlyMap<number, string>;

export const NO_CATALOG: CatalogNames = new Map();

export function catalogNames(entries: CatalogEntry[] | undefined): CatalogNames {
  return entries ? new Map(entries.map((e) => [e.id, e.name])) : NO_CATALOG;
}

/** The name a row groups and displays under: its catalog entry's name, else its own. */
export function groupName(catalogId: number | null, name: string, catalog: CatalogNames): string {
  return (catalogId != null ? catalog.get(catalogId) : undefined) ?? name;
}

/**
 * Changes whenever an entry is added, removed (merge) or updated (merge/split touch
 * updatedAt) — part of the coach dossier's memo key.
 */
export function catalogFingerprint(entries: CatalogEntry[]): string {
  const newest = entries.reduce((max, e) => (e.updatedAt > max ? e.updatedAt : max), '');
  return `${entries.length}:${newest}`;
}
