import { useMemo, useState } from 'react';
import { useCatalog, useMergeCatalog, useSplitCatalog } from '../../../shared/api/queries';
import type { CatalogEntry } from '../../../shared/api/types';
import { Input } from '../../../shared/ui/Input';
import { Modal } from '../../../shared/ui/Modal';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const usage = (e: CatalogEntry) =>
  `${plural(e.setCount, 'set')} · ${plural(e.exerciseCount, 'program exercise')}`;

const matches = (e: CatalogEntry, filter: string) => {
  const q = filter.trim().toLowerCase();
  return !q || e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q));
};

/**
 * Settings → Exercise catalog. One row per lift, sorted by name so near-duplicates sit
 * together ("Leg Curl / Leg Curl Machine"). "Merge into…" folds a spelling into another
 * entry (history keeps the logged names; Progress, hints, PRs and the coach see one lift);
 * an alias chip's × splits it back off. All judgement is the user's — no guessing here.
 */
export function ExerciseCatalogCard() {
  const { data: entries, isLoading, error } = useCatalog();
  const merge = useMergeCatalog();
  const split = useSplitCatalog();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [mergeSource, setMergeSource] = useState<CatalogEntry | null>(null);
  const [targetFilter, setTargetFilter] = useState('');

  const merged = useMemo(() => (entries ?? []).filter((e) => e.aliases.length > 0), [entries]);

  const visible = useMemo(() => (entries ?? []).filter((e) => matches(e, filter)), [entries, filter]);
  const targets = useMemo(
    () => (entries ?? []).filter((e) => e.id !== mergeSource?.id && matches(e, targetFilter)),
    [entries, mergeSource, targetFilter]
  );

  const openMerge = (entry: CatalogEntry) => {
    setTargetFilter('');
    setMergeSource(entry);
  };

  const handleMerge = (into: CatalogEntry) => {
    if (!mergeSource) return;
    const from = mergeSource;
    const ok = confirm(
      `Move ${plural(from.setCount, 'set')} and ${plural(from.exerciseCount, 'program exercise')} ` +
      `from "${from.name}" into "${into.name}"? The old name becomes an alias.`
    );
    if (!ok) return;
    merge.mutate({ intoId: into.id, fromId: from.id }, { onSuccess: () => setMergeSource(null) });
  };

  const handleSplit = (entry: CatalogEntry, alias: string) => {
    const ok = confirm(
      `Split "${alias}" off from "${entry.name}"? Sets logged as "${alias}" will count as their own exercise again.`
    );
    if (!ok) return;
    split.mutate({ id: entry.id, alias });
  };

  const busy = merge.isPending || split.isPending;

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Exercise catalog</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {open
              ? 'If two entries are the same lift under different names, merge them so Progress, PRs, "last time" hints and the coach treat them as one. History keeps the names you logged.'
              : 'Renamed a lift? Merge the old and new names so its history stays in one piece.'}
          </p>
        </div>
        {entries && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 min-h-[44px] px-2 text-sm font-medium text-primary-600 dark:text-primary-400"
            aria-expanded={open}
          >
            {open ? 'Done' : 'Manage'}
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">Couldn't load the catalog.</p>}

      {entries && !open && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          <p>
            {plural(entries.length, 'exercise')}
            {merged.length > 0 && ` · ${plural(merged.length, 'merged name')}`}
          </p>
          {merged.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {merged.map((entry) => (
                <li key={entry.id} className="text-gray-700 dark:text-gray-300">
                  {entry.name}
                  <span className="text-gray-500 dark:text-gray-400"> ← {entry.aliases.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {entries && open && (
        <>
          <Input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${entries.length} exercises`}
            aria-label="Filter exercises"
          />

          <ul className="max-h-[60vh] overflow-y-auto -mx-1 px-1 divide-y divide-gray-100 dark:divide-surface-700">
            {visible.map((entry) => (
              <li key={entry.id} className="py-2 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100 break-words">{entry.name}</p>
                  {entry.aliases.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {entry.aliases.map((alias) => (
                        <span
                          key={alias}
                          className="inline-flex items-center rounded-full bg-gray-100 dark:bg-surface-700 text-xs text-gray-700 dark:text-gray-300 pl-2"
                        >
                          {alias}
                          <button
                            type="button"
                            onClick={() => handleSplit(entry, alias)}
                            disabled={busy}
                            className="ml-0.5 w-7 h-7 inline-flex items-center justify-center rounded-full text-gray-500 hover:text-red-600 disabled:opacity-50"
                            aria-label={`Split off ${alias}`}
                            title="Split off"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{usage(entry)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openMerge(entry)}
                  disabled={busy}
                  className="shrink-0 min-h-[44px] px-2 text-sm font-medium text-primary-600 dark:text-primary-400 disabled:opacity-50"
                >
                  Merge into…
                </button>
              </li>
            ))}
            {visible.length === 0 && (
              <li className="py-3 text-sm text-gray-500 dark:text-gray-400">No matches.</li>
            )}
          </ul>
        </>
      )}

      <Modal
        isOpen={mergeSource !== null}
        onClose={() => setMergeSource(null)}
        title={mergeSource ? `Merge "${mergeSource.name}" into…` : undefined}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Pick the name to keep — usually the one in your current program.
          </p>
          <Input
            type="search"
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
            placeholder="Filter"
            aria-label="Filter merge targets"
          />
          <ul className="max-h-[50vh] overflow-y-auto divide-y divide-gray-100 dark:divide-surface-700">
            {targets.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => handleMerge(entry)}
                  disabled={busy}
                  className="w-full min-h-[44px] py-2 text-left hover:bg-gray-50 dark:hover:bg-surface-700 disabled:opacity-50"
                >
                  <span className="block font-medium text-gray-900 dark:text-gray-100">{entry.name}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{usage(entry)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}
