// Pure helpers for the history editor (v4 C1). No React, no API.
import type { Exercise, Set } from '../../../shared/api/types';
import { isCardioSet } from '../../../shared/api/predicates';

export interface EditGroup {
  name: string;
  /** The program slot the sets point at, else null (ad-hoc / swapped / deleted slot). */
  exerciseId: number | null;
  cardio: boolean;
  sets: Set[];
}

/** Sets grouped by exercise name, in first-set order (sets arrive in id order). */
export function groupSetsByExercise(sets: readonly Set[]): EditGroup[] {
  const groups = new Map<string, EditGroup>();
  for (const set of sets) {
    let group = groups.get(set.exerciseName);
    if (!group) {
      group = { name: set.exerciseName, exerciseId: set.exerciseId, cardio: false, sets: [] };
      groups.set(set.exerciseName, group);
    }
    group.sets.push(set);
    if (isCardioSet(set)) group.cardio = true;
  }
  return [...groups.values()];
}

/**
 * Next set number for an exercise: max existing standard set + 1. Not count + 1,
 * which repeats a number after a mid-list delete (setNumber-keyed maps collide).
 */
export function nextSetNumber(sets: readonly Set[]): number {
  return sets.reduce((max, s) => ((s.dropIndex || 0) === 0 ? Math.max(max, s.setNumber) : max), 0) + 1;
}

/** Program slots with no logged sets (matched by name, case-insensitive). */
export function unloggedSlots(exercises: readonly Exercise[] | undefined, loggedNames: readonly string[]): Exercise[] {
  const logged = new globalThis.Set(loggedNames.map(n => n.trim().toLowerCase()));
  return (exercises ?? []).filter(e => !logged.has(e.name.trim().toLowerCase()));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A Date from local date (YYYY-MM-DD) + time (HH:MM) inputs; null when malformed. */
export function localDateTime(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const result = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  return Number.isNaN(result.getTime()) ? null : result;
}

/** ISO timestamp → the local `YYYY-MM-DD` and `HH:MM` an <input> pair shows. */
export function toLocalInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
