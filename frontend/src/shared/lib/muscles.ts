import type { CatalogEntry, MuscleTags } from '../api/types';

/**
 * The muscle vocabulary (v4 C5, docs/v4-bundle-c5-muscles.md §3). Same ids as the backend's
 * MUSCLES (backend/src/db/schema.ts), which validates them. Ids are stored and can only ever be
 * added; labels and order are display-only and can change freely.
 */
export const MUSCLE_GROUPS = [
  {
    group: 'Push',
    muscles: [
      { id: 'chest', label: 'Chest' },
      { id: 'front-delts', label: 'Front delts' },
      { id: 'side-delts', label: 'Side delts' },
      { id: 'triceps', label: 'Triceps' },
    ],
  },
  {
    group: 'Pull',
    muscles: [
      { id: 'lats', label: 'Lats' },
      { id: 'upper-back', label: 'Upper back' },
      { id: 'rear-delts', label: 'Rear delts' },
      { id: 'biceps', label: 'Biceps' },
      { id: 'forearms', label: 'Forearms' },
    ],
  },
  {
    group: 'Core',
    muscles: [
      { id: 'abs', label: 'Abs' },
      { id: 'obliques', label: 'Obliques' },
      { id: 'lower-back', label: 'Lower back' },
    ],
  },
  {
    group: 'Legs',
    muscles: [
      { id: 'quads', label: 'Quads' },
      { id: 'hamstrings', label: 'Hamstrings' },
      { id: 'glutes', label: 'Glutes' },
      { id: 'adductors', label: 'Adductors' },
      { id: 'abductors', label: 'Abductors' },
      { id: 'calves', label: 'Calves' },
    ],
  },
] as const;

export type Muscle = (typeof MUSCLE_GROUPS)[number]['muscles'][number]['id'];

/** Every muscle id in display order. */
export const MUSCLES: readonly Muscle[] = MUSCLE_GROUPS.flatMap((g) => g.muscles.map((m) => m.id));

const LABELS: ReadonlyMap<string, string> = new Map(
  MUSCLE_GROUPS.flatMap((g) => g.muscles.map((m) => [m.id, m.label] as const))
);

/** Display label; an id this build doesn't know (newer backend) shows as itself. */
export function muscleLabel(id: string): string {
  return LABELS.get(id) ?? id;
}

/** catalogId → tags, tagged entries only. */
export type CatalogMuscles = ReadonlyMap<number, MuscleTags>;

export const NO_MUSCLES: CatalogMuscles = new Map();

/** Tagged entries only; `muscles` absent (older backend) or null is untagged. */
export function catalogMuscles(entries: CatalogEntry[] | undefined): CatalogMuscles {
  if (!entries) return NO_MUSCLES;
  const map = new Map<number, MuscleTags>();
  for (const e of entries) {
    if (e.muscles && e.muscles.primary.length > 0) map.set(e.id, e.muscles);
  }
  return map;
}

/** "Quads, Glutes" — for a row under the lift's name. */
export function tagSummary(tags: MuscleTags): { primary: string; secondary: string } {
  return {
    primary: tags.primary.map(muscleLabel).join(', '),
    secondary: tags.secondary.map(muscleLabel).join(', '),
  };
}
