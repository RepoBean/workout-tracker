import { useUserProfile } from '../context/UserProfileContext';
import { computeTimeInZone, type ZoneNumber } from '../lib/hrZones';
import { formatMMSS } from '../utils/format';

interface Props {
  series: { t: number[]; b: number[] } | null | undefined;
}

const BAR_BG: Record<ZoneNumber, string> = {
  0: 'bg-gray-400 dark:bg-gray-500',
  1: 'bg-blue-500 dark:bg-blue-400',
  2: 'bg-green-500 dark:bg-green-400',
  3: 'bg-yellow-500 dark:bg-yellow-400',
  4: 'bg-orange-500 dark:bg-orange-400',
  5: 'bg-red-500 dark:bg-red-400',
};

const DOT_BG: Record<ZoneNumber, string> = BAR_BG;

export function TimeInZoneBar({ series }: Props) {
  const { profile } = useUserProfile();
  const result = computeTimeInZone(series, profile);
  if (!result || result.totalSeconds === 0) return null;

  const { totalSeconds, breakdown } = result;
  const visible = breakdown.filter((e) => e.seconds > 0);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-gray-500 dark:text-gray-400">Time in Zone</p>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-surface-850">
        {breakdown.map((e) => {
          if (e.seconds === 0) return null;
          const pct = (e.seconds / totalSeconds) * 100;
          return (
            <div
              key={e.zone}
              className={BAR_BG[e.zone]}
              style={{ width: `${pct}%` }}
              aria-label={`${e.name}: ${formatMMSS(e.seconds)}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {visible.map((e) => {
          const pct = Math.round((e.seconds / totalSeconds) * 100);
          return (
            <div key={e.zone} className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 tabular-nums">
              <span className={`inline-block w-2 h-2 rounded-full ${DOT_BG[e.zone]}`} />
              <span className="font-medium">{e.name}</span>
              <span className="ml-auto">{formatMMSS(e.seconds)}</span>
              <span className="text-gray-400 dark:text-gray-500 w-8 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
