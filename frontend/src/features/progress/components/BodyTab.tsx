import { useMemo, useState } from 'react';
import { useBodyweights, useLogWeighIn } from '../../../shared/api/bodyweights';
import type { BodyWeight } from '../../../shared/api/types';
import { bodyweightChange, formatBodyweight, latestWeighIn } from '../../../shared/lib/bodyweight';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
import { ProgressChart } from './ProgressChart';
import { RangeSelector, formatSessionDate, useChartRange } from './detailParts';
import { WeighInRow } from './WeighInRow';
import { latestLoggableDate, parseWeighInWeight } from './weighInForm';

// Progress → Body (v4 C3): log, chart and edit weigh-ins. Assisted lifts score at the
// bodyweight on each session's day (shared/lib/bodyweight.ts).

/** A calendar day as a local-noon timestamp: a bare YYYY-MM-DD parses as UTC midnight. */
const atNoon = (date: string) => `${date}T12:00:00`;

/** "−4 lbs over 32 d · −10 lbs over 95 d"; one entry when both windows reach the same weigh-in. */
function changeText(weighIns: BodyWeight[]): string | null {
  const texts = [30, 90].flatMap((windowDays) => {
    const change = bodyweightChange(weighIns, windowDays);
    if (!change) return [];
    const sign = change.delta > 0 ? '+' : change.delta < 0 ? '−' : '±';
    return [`${sign}${formatBodyweight(Math.abs(change.delta))} lbs over ${change.days} d`];
  });
  return [...new Set(texts)].join(' · ') || null;
}

function LogWeighIn({ latest }: { latest: BodyWeight | null }) {
  const [weightStr, setWeightStr] = useState(latest ? formatBodyweight(latest.weight) : '');
  const [date, setDate] = useState(() => latestLoggableDate());
  const [error, setError] = useState<string | undefined>();
  const log = useLogWeighIn();

  const save = () => {
    const parsed = parseWeighInWeight(weightStr);
    if (typeof parsed === 'string') {
      setError(parsed);
      return;
    }
    if (!date) {
      setError('Pick a date');
      return;
    }
    setError(undefined);
    log.mutate({ date, weight: parsed }, { onSuccess: () => setDate(latestLoggableDate()) });
  };

  return (
    <div className="card space-y-3">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Log weigh-in</h3>
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Weight (lbs)"
          type="number"
          inputMode="decimal"
          step="0.1"
          value={weightStr}
          onChange={(e) => setWeightStr(e.target.value)}
          error={error}
        />
        <Input
          label="Date"
          type="date"
          value={date}
          max={latestLoggableDate()}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Logging a date again replaces that day's weigh-in.
      </p>
      <Button className="w-full" onClick={save} disabled={log.isPending}>Save</Button>
    </div>
  );
}

function BodyweightChart({ weighIns }: { weighIns: BodyWeight[] }) {
  const points = useMemo(
    () => weighIns.map((w) => ({ date: atNoon(w.date), value: w.weight })),
    [weighIns]
  );
  const { range, setRange, visible } = useChartRange(points);
  return (
    <div className="card">
      <ProgressChart
        data={visible}
        exerciseName="Bodyweight"
        metric="weight"
        formatTooltip={(v) => `${formatBodyweight(v)} lbs`}
        emptyMessage="No weigh-ins in this range"
      />
      <RangeSelector value={range} onChange={setRange} />
    </div>
  );
}

export function BodyTab() {
  const { data, isLoading, error } = useBodyweights();

  if (isLoading) {
    return <div className="card text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>;
  }
  if (error) {
    return <div className="card text-center py-8 text-gray-500 dark:text-gray-400">Couldn't load weigh-ins.</div>;
  }
  if (!data?.available) {
    return (
      <div className="card text-center py-8 text-gray-500 dark:text-gray-400">
        This server doesn't have the bodyweight log yet. Your bodyweight is set in Settings → Profile.
      </div>
    );
  }

  const weighIns = data.weighIns;
  const latest = latestWeighIn(weighIns);
  const newestFirst = [...weighIns].reverse();
  const changes = changeText(weighIns);

  return (
    <div className="space-y-4">
      {latest && (
        <div className="card">
          <p className="text-xs text-gray-500 dark:text-gray-400">Latest · {formatSessionDate(atNoon(latest.date))}</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{formatBodyweight(latest.weight)} lbs</p>
          {changes && <p className="text-sm text-gray-600 dark:text-gray-300">{changes}</p>}
        </div>
      )}

      <LogWeighIn key={latest?.id ?? 0} latest={latest} />

      {weighIns.length === 0 ? (
        <div className="card text-sm text-gray-500 dark:text-gray-400">
          No weigh-ins yet. Assisted lifts (a −40 pull-up) count as bodyweight − 40 in volume, 1RM
          and PRs, using the weigh-in on or before each session's day. Sessions before your first
          weigh-in use that first one.
        </div>
      ) : (
        <>
          {weighIns.length > 1 && <BodyweightChart key={weighIns.length} weighIns={weighIns} />}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">History</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Tap to edit · swipe left to delete</p>
            <ul className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {newestFirst.map((w) => <WeighInRow key={`${w.id}:${w.updatedAt}`} weighIn={w} />)}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
