import { useEffect, useState } from 'react';
import type { CatalogEntry, MuscleTags } from '../../../shared/api/types';
import { Modal } from '../../../shared/ui/Modal';
import { MUSCLE_GROUPS } from '../../../shared/lib/muscles';

type Role = 'primary' | 'secondary';

/**
 * Settings → Exercise catalog → Muscles… (v4 C5). Two chip groups over the same 18 muscles;
 * picking a muscle in one list takes it out of the other. Save with nothing picked = untagged.
 */
export function MusclesModal({
  entry,
  saving,
  onClose,
  onSave,
}: {
  entry: CatalogEntry | null;
  saving: boolean;
  onClose: () => void;
  onSave: (muscles: MuscleTags | null) => void;
}) {
  const [primary, setPrimary] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string[]>([]);

  useEffect(() => {
    setPrimary(entry?.muscles?.primary ?? []);
    setSecondary(entry?.muscles?.secondary ?? []);
  }, [entry]);

  const toggle = (role: Role, id: string) => {
    const [mine, setMine, setOther] =
      role === 'primary' ? [primary, setPrimary, setSecondary] : [secondary, setSecondary, setPrimary];
    if (mine.includes(id)) {
      setMine(mine.filter((m) => m !== id));
    } else {
      setMine([...mine, id]);
      setOther((other) => other.filter((m) => m !== id));
    }
  };

  const canSave = primary.length > 0 || secondary.length === 0;

  const chips = (role: Role, picked: string[]) => (
    <div className="space-y-2">
      {MUSCLE_GROUPS.map((group) => (
        <div key={group.group} className="flex flex-wrap gap-1.5">
          {group.muscles.map((m) => {
            const on = picked.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(role, m.id)}
                aria-pressed={on}
                className={`min-h-[36px] px-3 rounded-full text-sm border transition-colors ${on
                  ? role === 'primary'
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-primary-50 border-primary-300 text-primary-800 dark:bg-primary-900/40 dark:border-primary-700 dark:text-primary-200'
                  : 'border-gray-200 text-gray-700 dark:border-surface-600 dark:text-gray-300'}`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <Modal isOpen={entry !== null} onClose={onClose} title={entry ? `Muscles: ${entry.name}` : undefined}>
      <div className="space-y-4">
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Primary</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Each set counts 1 for these.</p>
          {chips('primary', primary)}
        </section>
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Secondary</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Each set counts ½ for these.</p>
          {chips('secondary', secondary)}
        </section>
        {!canSave && (
          <p className="text-sm text-accent-700 dark:text-accent-400">Pick at least one primary muscle.</p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => onSave(null)}
            disabled={saving || !entry?.muscles}
            className="min-h-[44px] px-4 text-sm font-medium text-gray-600 dark:text-gray-300 disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => onSave(primary.length ? { primary, secondary } : null)}
            disabled={saving || !canSave}
            className="btn-primary min-h-[44px] px-5 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
