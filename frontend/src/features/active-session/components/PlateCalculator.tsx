import { useMemo } from 'react';
import { calculatePlates } from '../logic/plates';

const PLATE_COLORS: Record<number, string> = {
  45: 'bg-blue-600 text-white',
  35: 'bg-yellow-500 text-black',
  25: 'bg-green-600 text-white',
  10: 'bg-gray-800 text-white dark:bg-gray-300 dark:text-black',
  5: 'bg-red-600 text-white',
  2.5: 'bg-gray-400 text-black',
};

interface PlateCalculatorProps {
  weight: number;
}

export function PlateCalculator({ weight }: PlateCalculatorProps) {
  const result = useMemo(() => calculatePlates(weight), [weight]);

  if (weight <= 45 || result.perSide.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs">
      <span className="text-gray-500 dark:text-gray-400 shrink-0">Per side:</span>
      {result.perSide.map(({ plate, count }) => (
        <span key={plate} className="flex items-center gap-0.5">
          {count > 1 && (
            <span className="text-gray-500 dark:text-gray-400">{count}x</span>
          )}
          <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${PLATE_COLORS[plate] || 'bg-gray-500 text-white'}`}>
            {plate}
          </span>
        </span>
      ))}
      {result.remainder > 0 && (
        <span className="text-amber-600 dark:text-amber-400 ml-1">
          Nearest: {result.achievableWeight} lbs
        </span>
      )}
    </div>
  );
}
