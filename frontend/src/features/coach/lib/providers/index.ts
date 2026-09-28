import type { AiCoachSettings } from '../../../../shared/context/AiCoachContext';
import { PROVIDER_PRESETS } from './presets';
import { createAnthropicProvider } from './anthropic';
import { createOpenAiCompatibleProvider } from './openaiCompatible';
import type { ChatProvider } from './types';
import { getApiBaseUrl } from '../../../../shared/api/baseUrl';

/** Build a configured ChatProvider from the user's saved settings. */
export function createProvider(settings: AiCoachSettings): ChatProvider {
  const preset = PROVIDER_PRESETS[settings.provider];

  if (preset.adapter === 'anthropic') {
    return createAnthropicProvider({ apiKey: settings.apiKey, model: settings.model });
  }

  const configured = preset.editableBaseUrl ? settings.baseUrl : preset.baseUrl;
  // Server-relative presets (the Google proxy) live on the app's server. On the web that
  // is the page origin; in the Android app the page is https://localhost, so prefix the
  // configured server URL ('' on the web → unchanged).
  const baseUrl = configured.startsWith('/') ? `${getApiBaseUrl()}${configured}` : configured;
  return createOpenAiCompatibleProvider({
    apiKey: settings.apiKey,
    model: settings.model,
    baseUrl,
    stripModelPrefix: preset.stripModelPrefix,
  });
}

export type { ChatProvider } from './types';
export { PROVIDER_PRESETS, PROVIDER_ORDER } from './presets';
