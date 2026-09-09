// The coach's view of the world, as text.
//
// Measured on live data (88 sessions, 49 distinct lifts), the entire training history is
// 6,692 tokens and a tiered summary of it is ~2,800 — while the tool DEFINITIONS alone cost
// ~1,000 tokens on every request, and every tool round trip re-sends the whole conversation.
// The data is smaller than the machinery built to query it, so it is pushed into the system
// prompt instead of pulled a piece at a time.
//
// STABILITY IS LOAD-BEARING. This text sits behind a prompt-cache breakpoint, so it must be
// byte-identical across turns within a conversation or caching never hits. Absolute dates
// only — no "3 days ago", no elapsed times, no `new Date()` inside a builder. Every function
// here is pure and takes `today` explicitly.
//
// NEVER emit: heartRateSeries, database ids, or timestamps. ~12% of the raw payload bytes,
// zero value to the model.

import type { Program, Session, Set as WorkoutSet, StatsResponse } from '../../../shared/api/types';
import { isCardioSet } from '../../../shared/api/predicates';
import { exerciseTargetSummary } from '../../../shared/api/cardio';
import { epleyOneRepMax } from '../../../shared/lib/oneRepMax';
import { computeAge, type UserProfile } from '../../../shared/lib/hrZones';
import type { ProgressionSettings } from '../../../shared/context/ProgressionContext';

/** A lift is treated as dropped once this many days pass without it. */
const DROPPED_AFTER_DAYS = 42;
/** Consecutive sessions at an unchanged top weight before it reads as a stall. */
const STALL_SESSIONS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Small formatters
// ---------------------------------------------------------------------------

/** ISO timestamp -> YYYY-MM-DD. Dates only; never emit a time-of-day. */
export function isoDate(value: string | null): string {
  return value ? value.slice(0, 10) : 'unknown';
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

function months(days: number): string {
  return `${(days / 30.44).toFixed(1)}mo`;
}

/** 1830 -> "30min"; 95 -> "1.6min". Cardio durations only. */
function durationLabel(sec: number): string {
  const mins = sec / 60;
  return `${mins >= 10 ? Math.round(mins) : Math.round(mins * 10) / 10}min`;
}

function cardioSetLabel(s: WorkoutSet): string {
  const parts: string[] = [];
  if ((s.durationSec ?? 0) > 0) parts.push(durationLabel(s.durationSec as number));
  if ((s.distance ?? 0) > 0) parts.push(`${s.distance}mi`);
  return parts.join('/') || '—';
}

/** Working sets only — drop sets are excluded from every best/volume figure. */
function isWorkingSet(s: WorkoutSet): boolean {
  return (s.dropIndex || 0) === 0;
}

// ---------------------------------------------------------------------------
// Session rendering — shared by the recent block and get_workout_history
// ---------------------------------------------------------------------------

function renderSets(sets: WorkoutSet[]): string {
  const ordered = [...sets].sort((a, b) => a.setNumber - b.setNumber || a.dropIndex - b.dropIndex);
  const rpes = ordered.map((s) => s.perceivedEffort).filter((r): r is number => r != null);
  // One trailing @N when the whole exercise shared an RPE; otherwise tag each set.
  const uniform =
    rpes.length === ordered.length && rpes.length > 0 && rpes.every((r) => r === rpes[0]);

  const body = ordered
    .map((s) => {
      const core = isCardioSet(s) ? cardioSetLabel(s) : `${s.weight}x${s.reps}`;
      const drop = (s.dropIndex || 0) > 0 ? ' drop' : '';
      const rpe = !uniform && s.perceivedEffort != null ? `@${s.perceivedEffort}` : '';
      return `${core}${rpe}${drop}`;
    })
    .join(',');

  return uniform ? `${body} @${rpes[0]}` : body;
}

/**
 * One session as a compact block. Also used by `get_workout_history` so the model sees
 * exactly one session format everywhere.
 */
export function renderSession(session: Session): string {
  const header: string[] = [`${isoDate(session.completedAt)} ${session.workoutName}`];

  if (session.completedAt && session.createdAt) {
    const mins = Math.round(
      (Date.parse(session.completedAt) - Date.parse(session.createdAt)) / 60000
    );
    // Advisory only: a session left open overnight inflates this.
    if (mins > 0 && mins < 300) header.push(`${mins}min`);
  }
  if (session.heartRateAvg != null) {
    const hr = [`HR ${session.heartRateAvg} avg`];
    if (session.heartRateMax != null) hr.push(`${session.heartRateMax} max`);
    header.push(hr.join(' / '));
  }

  const byExercise = new Map<string, WorkoutSet[]>();
  for (const s of [...(session.sets ?? [])].sort((a, b) => a.id - b.id)) {
    const list = byExercise.get(s.exerciseName);
    if (list) list.push(s);
    else byExercise.set(s.exerciseName, [s]);
  }

  const lines = [header.join(' · ')];
  for (const [name, sets] of byExercise) {
    lines.push(`  ${name}: ${renderSets(sets)}`);
  }
  for (const [exercise, note] of Object.entries(session.exerciseNotes ?? {})) {
    if (note?.trim()) lines.push(`  note (${exercise}): ${note.trim()}`);
  }
  return lines.join('\n');
}

/** Newest first. Used for the recent-20 block and for history tool results. */
export function renderSessions(sessions: Session[]): string {
  return sessions.map(renderSession).join('\n');
}

// ---------------------------------------------------------------------------
// All-time per-exercise block
// ---------------------------------------------------------------------------

interface ExerciseRollup {
  name: string;
  sets: number;
  dates: Set<string>;
  cardio: boolean;
  firstWeight: number;
  lastWeight: number;
  bestWeight: number;
  bestReps: number;
  best1RM: number;
  minDurationSec: number;
  maxDurationSec: number;
  firstDistance: number;
  lastDistance: number;
  firstDate: string;
  lastDate: string;
  /** date -> heaviest working weight that day, for stall detection. */
  topByDate: Map<string, number>;
}

function rollupExercises(sessions: Session[]): Map<string, ExerciseRollup> {
  const out = new Map<string, ExerciseRollup>();
  // Oldest first so first/last weight land the right way round.
  const ordered = [...sessions].sort((a, b) =>
    isoDate(a.completedAt).localeCompare(isoDate(b.completedAt))
  );

  for (const session of ordered) {
    const date = isoDate(session.completedAt);
    for (const set of session.sets ?? []) {
      if (!isWorkingSet(set)) continue;
      let r = out.get(set.exerciseName);
      if (!r) {
        r = {
          name: set.exerciseName,
          sets: 0,
          dates: new Set(),
          cardio: false,
          firstWeight: 0,
          lastWeight: 0,
          bestWeight: 0,
          bestReps: 0,
          best1RM: 0,
          minDurationSec: Infinity,
          maxDurationSec: 0,
          firstDistance: 0,
          lastDistance: 0,
          firstDate: date,
          lastDate: date,
          topByDate: new Map(),
        };
        out.set(set.exerciseName, r);
      }
      r.sets += 1;
      r.dates.add(date);
      r.lastDate = date;

      if (isCardioSet(set)) {
        r.cardio = true;
        if ((set.durationSec ?? 0) > 0) {
          r.minDurationSec = Math.min(r.minDurationSec, set.durationSec as number);
          r.maxDurationSec = Math.max(r.maxDurationSec, set.durationSec as number);
        }
        if ((set.distance ?? 0) > 0) {
          if (!r.firstDistance) r.firstDistance = set.distance as number;
          r.lastDistance = set.distance as number;
        }
        continue;
      }

      if (!r.firstWeight && set.weight > 0) r.firstWeight = set.weight;
      if (set.weight > 0) r.lastWeight = set.weight;
      if (set.weight > 0 && set.reps > 0) {
        const e1rm = epleyOneRepMax(set.weight, set.reps);
        if (e1rm > r.best1RM) {
          r.best1RM = e1rm;
          r.bestWeight = set.weight;
          r.bestReps = set.reps;
        }
      }
      r.topByDate.set(date, Math.max(r.topByDate.get(date) ?? 0, set.weight));
    }
  }
  return out;
}

/**
 * Trailing run of sessions at an unchanged top weight, or 0. Precomputed because
 * "same weight across N sessions, for 49 lifts" is arithmetic over a wall of text —
 * exactly what a model does worst.
 */
function stallRun(topByDate: Map<string, number>): { sessions: number; weight: number } {
  const dates = [...topByDate.keys()].sort();
  if (dates.length === 0) return { sessions: 0, weight: 0 };
  const weight = topByDate.get(dates[dates.length - 1]) as number;
  if (!weight) return { sessions: 0, weight: 0 };
  let run = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (topByDate.get(dates[i]) !== weight) break;
    run += 1;
  }
  return { sessions: run, weight };
}

function renderRollup(r: ExerciseRollup, today: string): string {
  const parts: string[] = [`${r.sets} sets`, `${r.dates.size} dates`];

  if (r.cardio) {
    if (r.maxDurationSec > 0) {
      parts.push(
        r.minDurationSec === r.maxDurationSec
          ? durationLabel(r.maxDurationSec)
          : `${durationLabel(r.minDurationSec)}-${durationLabel(r.maxDurationSec)}`
      );
    }
    if (r.lastDistance > 0) {
      parts.push(
        r.firstDistance === r.lastDistance
          ? `${r.lastDistance}mi`
          : `${r.firstDistance}→${r.lastDistance}mi`
      );
    }
  } else {
    if (r.firstWeight || r.lastWeight) {
      parts.push(
        r.firstWeight === r.lastWeight
          ? `${r.lastWeight} lb`
          : `${r.firstWeight}→${r.lastWeight} lb`
      );
    }
    if (r.best1RM > 0) parts.push(`best ${r.bestWeight}x${r.bestReps} (1RM ${r.best1RM})`);
  }

  parts.push(`last ${r.lastDate}`);

  const flags: string[] = [];
  const idle = daysBetween(r.lastDate, today);
  if (idle >= DROPPED_AFTER_DAYS) flags.push(`dropped ${months(idle)}`);
  if (!r.cardio) {
    const stall = stallRun(r.topByDate);
    if (stall.sessions >= STALL_SESSIONS) {
      flags.push(`stalled ${stall.sessions} sessions @${stall.weight}`);
    }
  }
  const flagText = flags.length ? ` [${flags.join('; ')}]` : '';

  return `${r.name}: ${parts.join(', ')}${flagText}`;
}

/**
 * All-time per-exercise summary, most-trained first. Grows with distinct exercise NAMES
 * (49, a handful added per year), not with sessions — which is why the dossier stays flat
 * at ~3k tokens no matter how long the history gets.
 */
export function buildAllTimeBlock(sessions: Session[], today: string): string {
  const rollups = [...rollupExercises(sessions).values()].sort(
    (a, b) => b.sets - a.sets || a.name.localeCompare(b.name)
  );
  if (rollups.length === 0) return 'All-time per exercise: none yet.';
  return [
    'All-time per exercise (most trained first):',
    ...rollups.map((r) => `  ${renderRollup(r, today)}`),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Notes — ALL of them, all time
// ---------------------------------------------------------------------------

/**
 * Every exercise note ever written, newest first.
 *
 * These must NOT ride along with the recent-sessions block: live, 3 of 4 noted sessions fall
 * outside the last-20 window, so a recent-only design would hide most of them. They are the
 * highest-signal rows in the database — a niggle, a form fault, a tempo cue — and none of it
 * is recoverable from any number. Notes are rare, so all-time stays cheap (~60 tokens).
 */
export function buildNotesBlock(sessions: Session[]): string {
  const lines: string[] = [];
  const ordered = [...sessions].sort((a, b) =>
    isoDate(b.completedAt).localeCompare(isoDate(a.completedAt))
  );
  for (const session of ordered) {
    for (const [exercise, note] of Object.entries(session.exerciseNotes ?? {})) {
      if (note?.trim()) {
        lines.push(`  ${isoDate(session.completedAt)} ${exercise}: ${note.trim()}`);
      }
    }
  }
  if (lines.length === 0) return '';
  return ['Notes (all time — the user wrote these; weight them heavily):', ...lines].join('\n');
}

// ---------------------------------------------------------------------------
// Programs, athlete, stats
// ---------------------------------------------------------------------------

export function buildProgramBlock(programs: Program[]): string {
  const active = programs.find((p) => p.isActive && !p.isArchived);
  const others = programs
    .filter((p) => !p.isActive && !p.isArchived)
    .map((p) => p.name)
    .sort();

  const lines: string[] = [];
  if (!active) {
    lines.push('Active program: none set.');
  } else {
    const workouts = [...(active.workouts ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    const upNext = workouts[active.currentWorkoutIndex % Math.max(workouts.length, 1)];
    lines.push(
      `Active program: ${active.name} (${workouts.length} workouts) — up next: ${upNext?.name ?? 'unknown'}`
    );
    for (const w of workouts) {
      const exercises = [...(w.exercises ?? [])]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((e) => {
          const superset = e.supersetGroup ? ` (superset ${e.supersetGroup})` : '';
          return `${e.name} ${exerciseTargetSummary(e)}${superset}`;
        });
      lines.push(`  ${w.name}: ${exercises.join('; ') || 'no exercises'}`);
    }
  }
  if (others.length) lines.push(`Other programs (not active): ${others.join(', ')}`);
  return lines.join('\n');
}

/**
 * Age, sex, resting HR and the app's auto-progression settings — all already in the app
 * (localStorage) and all previously invisible to the coach. Without the progression settings
 * the coach advises "+10 lb" while the app pre-fills +5, contradicting the screen the user is
 * looking at. Age is whole years so it does not churn the cached prefix daily.
 */
export function buildAthleteLine(
  profile: UserProfile,
  progression: ProgressionSettings,
  today: string
): string {
  const parts: string[] = [];
  const age = computeAge(profile.dob, new Date(`${today}T00:00:00`));
  const sexLabel = profile.sex === 'male' ? 'M' : profile.sex === 'female' ? 'F' : '';
  if (age != null) parts.push(`${age}${sexLabel}`);
  else if (sexLabel) parts.push(sexLabel);
  if (profile.restingHr != null) parts.push(`resting HR ${profile.restingHr}`);
  parts.push(
    progression.enabled
      ? `auto-progression on (+${progression.incrementLbs} lb)`
      : 'auto-progression off'
  );
  return `Athlete: ${parts.join(' · ')}`;
}

export function buildStatsBlock(stats: StatsResponse | null): string {
  if (!stats) return '';
  return `Stats: ${stats.totalSessions} sessions total, ${stats.sessionsLast30Days} in last 30d, ${stats.weekStreak} week streak`;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface DossierParts {
  /** YYYY-MM-DD. Required — without it the model cannot resolve "last 3 months" at all. */
  today: string;
  athlete: string;
  programs: string;
  allTime: string;
  notes: string;
  recent: string;
  recentCount: number;
  stats: string;
}

export function assembleDossier(parts: DossierParts): string {
  const sections = [
    `Today: ${parts.today}`,
    parts.athlete,
    parts.stats,
    parts.programs,
    parts.allTime,
    parts.notes,
    parts.recent
      ? `Last ${parts.recentCount} sessions (newest first, full detail):\n${parts.recent}`
      : 'No completed sessions yet.',
  ].filter(Boolean);

  return [
    '=== TRAINING DOSSIER (current as of today; already loaded — do not fetch it) ===',
    sections.join('\n\n'),
    '=== END DOSSIER ===',
  ].join('\n\n');
}

/**
 * The two blocks derived from the full history. Memoized together by the hook because they
 * come from the same expensive payload and change only when a session completes.
 */
export function buildAllTimeParts(
  sessions: Session[],
  today: string
): { allTime: string; notes: string } {
  return {
    allTime: buildAllTimeBlock(sessions, today),
    notes: buildNotesBlock(sessions),
  };
}
