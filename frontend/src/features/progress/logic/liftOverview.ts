// The Exercises tab's landing list: one row per lift with its trend status, last top set
// and a best-1RM sparkline. Status comes from shared/lib/liftTrend.ts — the same rule the
// coach's all-time block uses, fed the same way (completed sessions, working sets, effective
// weight > 0, reps > 0, grouped by catalog identity, one entry per UTC date like the coach).

import type { Session, Set } from '../../../shared/api/types';
import { isCardioSet } from '../../../shared/api/predicates';
import { epleyOneRepMax } from '../../../shared/lib/oneRepMax';
import { effectiveWeight } from '../../../shared/lib/effectiveWeight';
import { groupName, NO_CATALOG, type CatalogNames } from '../../../shared/lib/catalog';
import {
    addToDayTop,
    liftStatus,
    type DayTop,
    type LiftStatus,
    type LiftStatusKind,
} from '../../../shared/lib/liftTrend';

/** Points in a row's sparkline (most recent dates). */
export const SPARK_POINTS = 8;

export interface LiftOverviewRow {
    name: string;
    status: LiftStatus;
    /** Heaviest working set of the latest date: raw signed weight (assisted reads −40). */
    lastSet: { weight: number; reps: number; completedAt: string } | null;
    /** Best estimated 1RM per date, oldest first, at most SPARK_POINTS. */
    spark: number[];
    /** Whole-percent change first → last spark point; null under 2 points. */
    changePct: number | null;
}

export interface LiftOverview {
    rows: LiftOverviewRow[];
    /** Non-empty statuses in SUMMARY_ORDER. */
    counts: Array<{ kind: LiftStatusKind; count: number }>;
}

/** List order: what needs attention first; program order within a group. */
const ROW_ORDER: LiftStatusKind[] = ['stalled', 'lighter', 'holding', 'progressing', 'new', 'inactive', 'none'];
/** Summary-line order: reads best-news first. */
const SUMMARY_ORDER: LiftStatusKind[] = ['progressing', 'holding', 'stalled', 'lighter', 'new', 'inactive', 'none'];

interface DayData {
    top: DayTop;
    best1RM: number;
    /** Heaviest effective set of the day (ties: more reps), with its raw weight. */
    topSet: { effective: number; weight: number; reps: number; completedAt: string };
}

function isoDate(completedAt: string): string {
    return completedAt.slice(0, 10);
}

export function buildLiftOverview(
    sessions: Session[],
    names: string[],
    bodyweight: number | null,
    today: string,
    catalog: CatalogNames = NO_CATALOG,
): LiftOverview {
    const wanted = new Set(names);
    const byLift = new Map<string, Map<string, DayData>>();

    for (const session of sessions) {
        if (!session.completedAt) continue;
        const date = isoDate(session.completedAt);
        for (const set of session.sets ?? ([] as Set[])) {
            if (isCardioSet(set) || (set.dropIndex || 0) > 0) continue;
            const name = groupName(set.catalogId, set.exerciseName, catalog);
            if (!wanted.has(name)) continue;
            const effective = effectiveWeight(set.weight, bodyweight);
            if (effective == null || effective <= 0 || set.reps <= 0) continue;

            let days = byLift.get(name);
            if (!days) byLift.set(name, (days = new Map()));
            const day = days.get(date);
            const e1rm = epleyOneRepMax(effective, set.reps);
            const candidate = { effective, weight: set.weight, reps: set.reps, completedAt: session.completedAt };
            if (!day) {
                days.set(date, { top: addToDayTop(undefined, effective, set.reps), best1RM: e1rm, topSet: candidate });
                continue;
            }
            day.top = addToDayTop(day.top, effective, set.reps);
            day.best1RM = Math.max(day.best1RM, e1rm);
            const t = day.topSet;
            if (effective > t.effective || (effective === t.effective && set.reps > t.reps)) day.topSet = candidate;
        }
    }

    const rows = names.map((name): LiftOverviewRow => {
        const days = byLift.get(name) ?? new Map<string, DayData>();
        const dates = [...days.keys()].sort();
        const topByDate = new Map(dates.map((d) => [d, (days.get(d) as DayData).top]));
        const spark = dates.slice(-SPARK_POINTS).map((d) => (days.get(d) as DayData).best1RM);
        const last = dates.length ? (days.get(dates[dates.length - 1]) as DayData).topSet : null;
        return {
            name,
            status: liftStatus(topByDate, today),
            lastSet: last && { weight: last.weight, reps: last.reps, completedAt: last.completedAt },
            spark,
            changePct: spark.length >= 2 && spark[0] > 0
                ? Math.round(((spark[spark.length - 1] - spark[0]) / spark[0]) * 100)
                : null,
        };
    });

    const rank = (r: LiftOverviewRow) => ROW_ORDER.indexOf(r.status.kind);
    // Array.prototype.sort is stable, so program order survives within a group.
    rows.sort((a, b) => rank(a) - rank(b));

    const counts = SUMMARY_ORDER
        .map((kind) => ({ kind, count: rows.filter((r) => r.status.kind === kind).length }))
        .filter((c) => c.count > 0);

    return { rows, counts };
}

/** YYYY-MM-DD or an ISO timestamp → "Oct 2" (local), with the year when it isn't `today`'s. */
export function shortDate(value: string, today: string): string {
    const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
    const sameYear = String(d.getFullYear()) === today.slice(0, 4);
    return d.toLocaleDateString('en-US', sameYear
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function statusLabel(status: LiftStatus, today: string): string {
    switch (status.kind) {
        case 'progressing': return 'Progressing';
        case 'holding': return 'Holding';
        case 'stalled': return `Stalled · ${status.sessions} sessions`;
        case 'lighter': return 'Lighter';
        case 'new': return 'New';
        case 'inactive': return `Not done since ${shortDate(status.lastDate, today)}`;
        case 'none': return 'No history yet';
    }
}

const SUMMARY_LABEL: Record<LiftStatusKind, string> = {
    progressing: 'progressing',
    holding: 'holding',
    stalled: 'stalled',
    lighter: 'lighter',
    new: 'new',
    inactive: 'inactive',
    none: 'no history',
};

/** "12 progressing · 4 holding · 2 stalled" */
export function summaryLine(counts: LiftOverview['counts']): string {
    return counts.map((c) => `${c.count} ${SUMMARY_LABEL[c.kind]}`).join(' · ');
}

/** +6% / −3% / 0% (real minus sign). */
export function formatChange(pct: number): string {
    if (pct > 0) return `+${pct}%`;
    if (pct < 0) return `−${-pct}%`;
    return '0%';
}
