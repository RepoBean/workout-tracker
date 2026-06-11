import type { AiCoachSettings } from '../../../../shared/context/AiCoachContext';
import { PROVIDER_PRESETS } from './presets';
import { createAnthropicProvider } from './anthropic';
import { createOpenAiCompatibleProvider } from './openaiCompatible';
import type { ChatProvider } from './types';

/** Build a configured ChatProvider from the user's saved settings. */
export function createProvider(settings: AiCoachSettings): ChatProvider {
  const preset = PROVIDER_PRESETS[settings.provider];

  if (preset.adapter === 'anthropic') {
    return createAnthropicProvider({ apiKey: settings.apiKey, model: settings.model });
  }

  const baseUrl = preset.editableBaseUrl ? settings.baseUrl : preset.baseUrl;
  return createOpenAiCompatibleProvider({
    apiKey: settings.apiKey,
    model: settings.model,
    baseUrl,
    stripModelPrefix: preset.stripModelPrefix,
  });
}

export type { ChatProvider } from './types';
export { PROVIDER_PRESETS, PROVIDER_ORDER } from './presets';
