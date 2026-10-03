import { describe, expect, it } from 'vitest';
import type { Program, Session, Set as WorkoutSet } from '../../../shared/api/types';
import { DEFAULT_PROFILE } from '../../../shared/lib/hrZones';
import { DEFAULT_PROGRESSION } from '../../../shared/context/ProgressionContext';
import {
  assembleDossier,
  buildAllTimeBlock,
  buildAthleteLine,
  buildNotesBlock,
  buildProgramBlock,
  buildStatsBlock,
  renderSession,
} from './dossier';

let nextId = 1;

function set(over: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: nextId++,
    sessionId: 1,
    exerciseId: 1,
    exerciseName: 'Leg Press',
    weight: 200,
    reps: 10,
    setNumber: 1,
    perceivedEffort: null,
    dropIndex: 0,
    heartRateAvg: null,
    heartRateMax: null,
    durationSec: null,
    distance: null,
    catalogId: null,
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T10:00:00.000Z',
    ...over,
  };
}

function session(over: Partial<Session> = {}): Session {
  return {
    id: nextId++,
    programId: 1,
    programName: 'Full Body',
    workoutId: 1,
    workoutName: 'Full Body A',
    completedAt: '2026-09-07T11:00:00.000Z',
    isAdHoc: false,
    heartRateAvg: null,
    heartRateMin: null,
    heartRateMax: null,
    heartRateSeries: null,
    exerciseNotes: null,
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T11:00:00.000Z',
    sets: [],
    ...over,
  };
}

const TODAY = '2026-09-09';

describe('renderSession', () => {
  it('renders per-set detail with a shared RPE', () => {
    const out = renderSession(
      session({
        sets: [
          set({ exerciseName: 'Low Incline DB Press', weight: 40, reps: 12, setNumber: 1, perceivedEffort: 9 }),
          set({ exerciseName: 'Low Incline DB Press', weight: 40, reps: 10, setNumber: 2, perceivedEffort: 9 }),
          set({ exerciseName: 'Low Incline DB Press', weight: 40, reps: 8, setNumber: 3, perceivedEffort: 9 }),
        ],
      })
    );
    expect(out).toContain('Low Incline DB Press: 40x12,40x10,40x8 @9');
  });

  it('tags RPE per set when they differ', () => {
    const out = renderSession(
      session({
        sets: [
          set({ weight: 100, reps: 10, setNumber: 1, perceivedEffort: 7 }),
          set({ weight: 100, reps: 8, setNumber: 2, perceivedEffort: 9 }),
        ],
      })
    );
    expect(out).toContain('Leg Press: 100x10@7,100x8@9');
  });

  it('omits RPE entirely when absent', () => {
    const out = renderSession({
      ...session({ sets: [set({ weight: 100, reps: 10 })] }),
    });
    expect(out).toContain('Leg Press: 100x10');
    expect(out).not.toContain('@');
  });

  it('renders cardio as duration/distance, never 0lb x 0', () => {
    const out = renderSession(
      session({
        sets: [
          set({ exerciseName: 'Treadmill', weight: 0, reps: 0, durationSec: 1680, distance: 3.1 }),
        ],
      })
    );
    expect(out).toContain('Treadmill: 28min/3.1mi');
    expect(out).not.toContain('0x0');
  });

  it('includes session HR and duration in the header', () => {
    const out = renderSession(
      session({
        heartRateAvg: 135,
        heartRateMax: 168,
        createdAt: '2026-09-07T10:00:00.000Z',
        completedAt: '2026-09-07T10:42:00.000Z',
        sets: [set()],
      })
    );
    expect(out).toContain('2026-09-07 Full Body A · 42min · HR 135 avg / 168 max');
  });

  it('includes exercise notes', () => {
    const out = renderSession(
      session({
        exerciseNotes: { 'Leg Press': 'Lower back felt used as well' },
        sets: [set()],
      })
    );
    expect(out).toContain('note (Leg Press): Lower back felt used as well');
  });

  it('never leaks ids, timestamps or the HR series', () => {
    const out = renderSession(
      session({
        id: 4242,
        heartRateSeries: '{"t":[0,5,10],"b":[120,130,140]}',
        sets: [set({ id: 9999, weight: 100, reps: 10 })],
      })
    );
    expect(out).not.toContain('4242');
    expect(out).not.toContain('9999');
    expect(out).not.toContain('heartRateSeries');
    expect(out).not.toContain('120,130,140');
    expect(out).not.toContain('T10:00:00');
  });

  it('groups sets by exercise in performed (id) order', () => {
    const out = renderSession(
      session({
        sets: [
          set({ id: 1, exerciseName: 'Squat', weight: 100, reps: 5, setNumber: 1 }),
          set({ id: 2, exerciseName: 'Bench', weight: 80, reps: 5, setNumber: 1 }),
          set({ id: 3, exerciseName: 'Squat', weight: 100, reps: 5, setNumber: 2 }),
        ],
      })
    );
    expect(out.indexOf('Squat:')).toBeLessThan(out.indexOf('Bench:'));
    expect(out).toContain('Squat: 100x5,100x5');
  });
});

describe('buildAllTimeBlock', () => {
  it('summarises a lift with progression and best set', () => {
    const out = buildAllTimeBlock(
      [
        session({
          completedAt: '2026-01-05T11:00:00.000Z',
          sets: [set({ weight: 180, reps: 10 })],
        }),
        session({
          completedAt: '2026-09-02T11:00:00.000Z',
          sets: [set({ weight: 225, reps: 10 })],
        }),
      ],
      TODAY
    );
    expect(out).toContain('Leg Press: 2 sets, 2 dates, 180→225 lb, best 225x10 (1RM 300), last 2026-09-02');
  });

  it('flags a lift dropped months ago', () => {
    const out = buildAllTimeBlock(
      [session({ completedAt: '2026-06-24T11:00:00.000Z', sets: [set({ exerciseName: 'Chest Press Machine' })] })],
      TODAY
    );
    expect(out).toMatch(/Chest Press Machine:.*\[dropped 2\.5mo\]/);
  });

  it('flags a stall at an unchanged top weight', () => {
    const dates = ['2026-08-20', '2026-08-27', '2026-09-03'];
    const out = buildAllTimeBlock(
      dates.map((d) =>
        session({
          completedAt: `${d}T11:00:00.000Z`,
          sets: [set({ exerciseName: 'Lat Pulldown Machine', weight: 140, reps: 10 })],
        })
      ),
      TODAY
    );
    expect(out).toContain('stalled 3 sessions @140');
  });

  it('does not flag a stall when the weight is still climbing', () => {
    const out = buildAllTimeBlock(
      [130, 135, 140].map((w, i) =>
        session({
          completedAt: `2026-09-0${i + 1}T11:00:00.000Z`,
          sets: [set({ weight: w, reps: 10 })],
        })
      ),
      TODAY
    );
    expect(out).not.toContain('stalled');
  });

  it('does not flag a held weight while reps climb (double progression)', () => {
    const out = buildAllTimeBlock(
      [8, 9, 10, 11].map((reps, i) =>
        session({
          completedAt: `2026-09-0${i + 1}T11:00:00.000Z`,
          sets: [set({ exerciseName: 'Row', weight: 100, reps }), set({ exerciseName: 'Row', weight: 100, reps: 8 })],
        })
      ),
      TODAY
    );
    expect(out).not.toContain('stalled');
  });

  it('counts total reps at the weight as progress too', () => {
    // Best single set stays at 10, but a third set gets added: 20 → 30 total reps.
    const sets = [[10, 10], [10, 10], [10, 10, 10]];
    const out = buildAllTimeBlock(
      sets.map((reps, i) =>
        session({
          completedAt: `2026-09-0${i + 1}T11:00:00.000Z`,
          sets: reps.map((r) => set({ exerciseName: 'Row', weight: 100, reps: r })),
        })
      ),
      TODAY
    );
    expect(out).not.toContain('stalled');
  });

  it('flags a plateau after progress, counting from the last improving session', () => {
    // 100: 8, 9, 10 (improving), then 10, 9, 10 — last improvement is the 3rd date, so the
    // stall covers dates 3..6 = 4 sessions.
    const out = buildAllTimeBlock(
      [8, 9, 10, 10, 9, 10].map((reps, i) =>
        session({
          completedAt: `2026-09-0${i + 1}T11:00:00.000Z`,
          sets: [set({ exerciseName: 'Row', weight: 100, reps })],
        })
      ),
      TODAY
    );
    expect(out).toContain('stalled 4 sessions @100');
  });

  it('starts the run at the latest weight jump, with that first session as baseline', () => {
    // 95 for a while, then 100 x 8, 8, 8: baseline + 2 non-improving = 3.
    const out = buildAllTimeBlock(
      [[95, 8], [95, 8], [95, 8], [100, 8], [100, 8], [100, 8]].map(([w, reps], i) =>
        session({
          completedAt: `2026-09-0${i + 1}T11:00:00.000Z`,
          sets: [set({ exerciseName: 'Row', weight: w, reps }), set({ exerciseName: 'Row', weight: w - 20, reps: 15 })],
        })
      ),
      TODAY
    );
    expect(out).toContain('stalled 3 sessions @100');
  });

  it('summarises cardio without weight nonsense', () => {
    const out = buildAllTimeBlock(
      [
        session({
          completedAt: '2026-09-01T11:00:00.000Z',
          sets: [set({ exerciseName: 'Treadmill', weight: 0, reps: 0, durationSec: 1200, distance: 2.0 })],
        }),
        session({
          completedAt: '2026-09-06T11:00:00.000Z',
          sets: [set({ exerciseName: 'Treadmill', weight: 0, reps: 0, durationSec: 1800, distance: 3.4 })],
        }),
      ],
      TODAY
    );
    expect(out).toContain('Treadmill: 2 sets, 2 dates, 20min-30min, 2→3.4mi, last 2026-09-06');
    expect(out).not.toContain('0x0');
    expect(out).not.toContain('1RM');
  });

  it('excludes drop sets from bests', () => {
    const out = buildAllTimeBlock(
      [
        session({
          sets: [
            set({ weight: 200, reps: 8, dropIndex: 0 }),
            set({ weight: 300, reps: 8, dropIndex: 1 }),
          ],
        }),
      ],
      TODAY
    );
    expect(out).toContain('best 200x8');
    expect(out).not.toContain('300');
  });

  it('keeps two spellings of a lift as two lines when nothing links them', () => {
    const out = buildAllTimeBlock(
      [
        session({
          completedAt: '2026-04-03T11:00:00.000Z',
          sets: [set({ exerciseName: 'Low Incline Dumbbell Press', weight: 60, reps: 10 })],
        }),
        session({
          completedAt: '2026-09-02T11:00:00.000Z',
          sets: [set({ exerciseName: 'Low Incline DB Press', weight: 70, reps: 10 })],
        }),
      ],
      TODAY
    );
    expect(out).toContain('  Low Incline DB Press: 1 sets, 1 dates, 70 lb, best 70x10 (1RM 93), last 2026-09-02');
    expect(out).toMatch(/ {2}Low Incline Dumbbell Press: 1 sets, 1 dates, 60 lb, best 60x10 \(1RM 80\), last 2026-04-03 \[dropped/);
  });

  it('rolls merged spellings up as one lift under the catalog name', () => {
    const out = buildAllTimeBlock(
      [
        session({
          completedAt: '2026-04-03T11:00:00.000Z',
          sets: [set({ exerciseName: 'Low Incline Dumbbell Press', weight: 60, reps: 10, catalogId: 7 })],
        }),
        session({
          completedAt: '2026-09-02T11:00:00.000Z',
          sets: [set({ exerciseName: 'Low Incline DB Press', weight: 70, reps: 10, catalogId: 7 })],
        }),
      ],
      TODAY,
      null,
      new Map([[7, 'Low Incline DB Press']])
    );
    expect(out).toBe([
      'All-time per exercise (most trained first):',
      '  Low Incline DB Press: 2 sets, 2 dates, 60→70 lb, best 70x10 (1RM 93), last 2026-09-02',
    ].join('\n'));
  });

  it('handles an empty history', () => {
    expect(buildAllTimeBlock([], TODAY)).toBe('All-time per exercise: none yet.');
  });

  it('scores assisted sets at effective load and continues hand-entered history', () => {
    const out = buildAllTimeBlock(
      [
        session({
          completedAt: '2026-08-01T11:00:00.000Z',
          sets: [set({ exerciseName: 'Neutral Grip Pull-Up', weight: 135, reps: 8 })],
        }),
        session({
          completedAt: '2026-09-02T11:00:00.000Z',
          sets: [set({ exerciseName: 'Neutral Grip Pull-Up', weight: -40, reps: 8 })],
        }),
      ],
      TODAY,
      185
    );
    expect(out).toContain('Neutral Grip Pull-Up: 2 sets, 2 dates, 135→145 lb effective (assisted), best 145x8');
  });

  it('fires stall detection on an unchanged assisted weight', () => {
    const dates = ['2026-08-20', '2026-08-27', '2026-09-03'];
    const out = buildAllTimeBlock(
      dates.map((d) =>
        session({
          completedAt: `${d}T11:00:00.000Z`,
          sets: [set({ exerciseName: 'Assisted Dip', weight: -50, reps: 10 })],
        })
      ),
      TODAY,
      185
    );
    expect(out).toContain('stalled 3 sessions @135');
  });

  it('leaves assisted sets out of weight figures without a bodyweight', () => {
    const out = buildAllTimeBlock(
      [session({ sets: [set({ exerciseName: 'Assisted Dip', weight: -50, reps: 10 })] })],
      TODAY
    );
    expect(out).toMatch(/Assisted Dip: 1 sets, 1 dates, last /);
    expect(out).not.toContain('1RM');
  });
});

describe('buildNotesBlock', () => {
  it('returns every note ever written, newest first', () => {
    const out = buildNotesBlock([
      session({ completedAt: '2026-05-10T11:00:00.000Z', exerciseNotes: { 'Neutral Grip Pull-Up': 'Arms felt it mostly' } }),
      session({ completedAt: '2026-07-01T11:00:00.000Z', exerciseNotes: { 'Leg Press': 'Lower back felt used as well' } }),
    ]);
    expect(out).toContain('2026-07-01 Leg Press: Lower back felt used as well');
    expect(out).toContain('2026-05-10 Neutral Grip Pull-Up: Arms felt it mostly');
    expect(out.indexOf('2026-07-01')).toBeLessThan(out.indexOf('2026-05-10'));
  });

  it('skips blank notes and returns empty when there are none', () => {
    expect(buildNotesBlock([session({ exerciseNotes: { 'Leg Press': '   ' } })])).toBe('');
    expect(buildNotesBlock([session()])).toBe('');
  });
});

describe('buildAthleteLine', () => {
  it('includes age, sex, resting HR and progression settings', () => {
    const line = buildAthleteLine(
      { dob: '1985-03-01', sex: 'male', restingHr: 58, maxHrOverride: null, bodyweight: null },
      { enabled: true, incrementLbs: 5 },
      TODAY
    );
    expect(line).toBe('Athlete: 41M · resting HR 58 · auto-progression on (+5 lb)');
  });

  it('includes bodyweight when set', () => {
    const line = buildAthleteLine(
      { dob: null, sex: 'unspecified', restingHr: null, maxHrOverride: null, bodyweight: 185 },
      { enabled: false, incrementLbs: 5 },
      TODAY
    );
    expect(line).toBe('Athlete: bodyweight 185 lb · auto-progression off');
  });

  it('degrades gracefully with an empty profile', () => {
    expect(buildAthleteLine(DEFAULT_PROFILE, DEFAULT_PROGRESSION, TODAY)).toBe(
      'Athlete: auto-progression off'
    );
  });
});

describe('buildProgramBlock', () => {
  const program: Program = {
    id: 1,
    name: 'Full Body',
    isActive: true,
    isArchived: false,
    currentWorkoutIndex: 1,
    createdAt: '',
    updatedAt: '',
    workouts: [
      {
        id: 1, programId: 1, name: 'Full Body A', orderIndex: 0, createdAt: '', updatedAt: '',
        exercises: [
          {
            id: 1, workoutId: 1, name: 'Goblet Squat', targetSets: 3, targetReps: '10-12',
            orderIndex: 0, supersetGroup: null, exerciseType: 'strength', cardioModality: null,
            targetDurationSec: null, targetDistance: null, catalogId: null, createdAt: '', updatedAt: '',
          },
          {
            id: 2, workoutId: 1, name: 'Treadmill', targetSets: 1, targetReps: '1',
            orderIndex: 1, supersetGroup: null, exerciseType: 'cardio', cardioModality: 'treadmill',
            targetDurationSec: 1800, targetDistance: 3, catalogId: null, createdAt: '', updatedAt: '',
          },
        ],
      },
      { id: 2, programId: 1, name: 'Full Body B', orderIndex: 1, createdAt: '', updatedAt: '', exercises: [] },
    ],
  };

  it('names the active program and what is up next', () => {
    const out = buildProgramBlock([program]);
    expect(out).toContain('Active program: Full Body (2 workouts) — up next: Full Body B');
    expect(out).toContain('Goblet Squat 3 × 10-12');
  });

  it('renders cardio targets instead of the 1 × 1 placeholder', () => {
    const out = buildProgramBlock([program]);
    expect(out).toContain('Treadmill Treadmill · 30 min · 3 mi');
    expect(out).not.toContain('1 × 1');
  });

  it('lists other programs and handles none active', () => {
    const archived: Program = { ...program, id: 3, name: 'Old Split', isActive: false, workouts: [] };
    expect(buildProgramBlock([program, archived])).toContain('Other programs (not active): Old Split');
    expect(buildProgramBlock([])).toBe('Active program: none set.');
  });
});

describe('assembleDossier', () => {
  const parts = {
    today: TODAY,
    athlete: 'Athlete: 41M · auto-progression off',
    programs: 'Active program: Full Body (2 workouts) — up next: Full Body B',
    allTime: 'All-time per exercise:\n  Leg Press: 2 sets',
    notes: 'Notes (all time):\n  2026-07-01 Leg Press: sore',
    recent: '2026-09-07 Full Body A\n  Leg Press: 200x10',
    recentCount: 1,
    stats: 'Stats: 88 sessions total, 12 in last 30d, 3 week streak',
  };

  it('is byte-stable for identical input', () => {
    expect(assembleDossier(parts)).toBe(assembleDossier({ ...parts }));
  });

  it('leads with today so relative ranges can be resolved', () => {
    expect(assembleDossier(parts)).toContain(`Today: ${TODAY}`);
  });

  it('drops empty sections rather than emitting blank headers', () => {
    const out = assembleDossier({ ...parts, notes: '', stats: '' });
    expect(out).not.toContain('\n\n\n');
    expect(out).toContain('Leg Press');
  });

  it('says so plainly when there is no history', () => {
    expect(assembleDossier({ ...parts, recent: '', recentCount: 0 })).toContain(
      'No completed sessions yet.'
    );
  });
});

describe('buildStatsBlock', () => {
  it('renders stats and tolerates their absence', () => {
    expect(buildStatsBlock({ totalSessions: 88, sessionsLast30Days: 12, weekStreak: 3 })).toBe(
      'Stats: 88 sessions total, 12 in last 30d, 3 week streak'
    );
    expect(buildStatsBlock(null)).toBe('');
  });
});
