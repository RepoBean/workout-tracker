import { useState } from 'react';
import { useAiCoach, AiCoachSettings } from '../../../shared/context/AiCoachContext';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
import { useToast } from '../../../shared/ui/Toast';
// Presets only — the provider stack (incl. @anthropic-ai/sdk) is dynamically
// imported at call time so the Settings page doesn't ship it.
import { PROVIDER_ORDER, PROVIDER_PRESETS } from '../lib/providers/presets';
import type { ModelOption } from '../lib/providers/types';

export function AiCoachSettingsCard() {
  const { settings, setSettings } = useAiCoach();
  const toast = useToast();

  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [manualModel, setManualModel] = useState(false);
  const [filter, setFilter] = useState('');

  const preset = PROVIDER_PRESETS[settings.provider];

  function update(partial: Partial<AiCoachSettings>) {
    setSettings({ ...settings, ...partial });
  }

  function changeProvider(provider: AiCoachSettings['provider']) {
    // A model id from one provider won't be valid for another — reset.
    setModels(null);
    setManualModel(false);
    setFilter('');
    setSettings({ ...settings, provider, model: '' });
  }

  async function loadModels() {
    if (!settings.apiKey.trim()) {
      toast.error('Enter an API key first');
      return;
    }
    if (preset.editableBaseUrl && !settings.baseUrl.trim()) {
      toast.error('Enter a base URL first');
      return;
    }
    setLoadingModels(true);
    try {
      const { createProvider } = await import('../lib/providers');
      const list = await createProvider(settings).listModels();
      list.sort((a, b) => a.id.localeCompare(b.id));
      setModels(list);
      setManualModel(false);
      if (list.length === 0) {
        toast.info('No models returned — enter a model name manually');
        setManualModel(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load models';
      toast.error(message);
      // Never block the user — let them type a model name by hand.
      setManualModel(true);
    } finally {
      setLoadingModels(false);
    }
  }

  const filteredModels =
    models?.filter((m) => m.id.toLowerCase().includes(filter.toLowerCase())) ?? [];

  return (
    <div className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Coach</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Chat with an AI coach that reads your training history and can draft programs. Bring
          your own API key — it's stored in plaintext in this browser only.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Enable AI Coach
        </span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500"
        />
      </label>

      {settings.enabled && (
        <>
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Provider
            </span>
            <div className="space-y-2">
              {PROVIDER_ORDER.map((id) => (
                <label
                  key={id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 border-gray-200 dark:border-surface-800 bg-white dark:bg-surface-900 cursor-pointer transition-colors hover:border-primary-300 dark:hover:border-primary-700"
                >
                  <input
                    type="radio"
                    name="ai-provider"
                    value={id}
                    checked={settings.provider === id}
                    onChange={() => changeProvider(id)}
                    className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {PROVIDER_PRESETS[id].label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Input
              label="API key"
              type="password"
              autoComplete="off"
              value={settings.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder="Paste your key"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{preset.keyHint}</p>
          </div>

          {preset.editableBaseUrl && (
            <Input
              label="Base URL"
              type="url"
              value={settings.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder="https://your-endpoint/v1"
            />
          )}

          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Model
            </span>

            {models && models.length > 0 && !manualModel ? (
              <div className="space-y-2">
                {models.length > 12 && (
                  <Input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter models…"
                  />
                )}
                <select
                  value={settings.model}
                  onChange={(e) => update({ model: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 rounded-lg border-gray-200 dark:border-surface-800 bg-white dark:bg-surface-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary-500"
                >
                  <option value="">Select a model…</option>
                  {filteredModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label ? `${m.label} (${m.id})` : m.id}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <Input
                type="text"
                value={settings.model}
                onChange={(e) => update({ model: e.target.value })}
                placeholder={manualModel ? 'Enter model id manually' : 'Load models, or type a model id'}
              />
            )}

            <div className="mt-2 flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={loadModels}
                disabled={loadingModels}
              >
                {loadingModels ? 'Loading…' : 'Load models'}
              </Button>
              {models && models.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  onClick={() => setManualModel((v) => !v)}
                >
                  {manualModel ? 'Pick from list' : 'Type model id'}
                </button>
              )}
            </div>
            {settings.model && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Selected: <span className="font-mono">{settings.model}</span>
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
