interface AssistToggleProps {
  assisted: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Unit label that doubles as the sign switch for assisted lifts. The phone's decimal
 * keypad has no minus key, so the weight input holds the magnitude and this button
 * decides whether it is a load ("lbs") or assistance ("assist", stored negative).
 */
export function AssistToggle({ assisted, onToggle, className = '' }: AssistToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Toggle assisted weight"
      aria-pressed={assisted}
      className={`min-h-[44px] shrink-0 rounded-lg text-xs font-semibold transition-colors
                  ${assisted
                    ? 'text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-900/20'
                    : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-surface-800'}
                  ${className}`}
    >
      {assisted ? 'assist' : 'lbs'}
    </button>
  );
}
