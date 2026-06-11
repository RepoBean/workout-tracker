import type { ProviderId } from '../../../../shared/context/AiCoachContext';

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  adapter: 'anthropic' | 'openai-compatible';
  /** Base URL for OpenAI-compatible adapters. Ignored for anthropic. */
  baseUrl: string;
  /** When true the user supplies the base URL (custom escape hatch). */
  editableBaseUrl: boolean;
  /** Google's OpenAI-compat list returns ids prefixed with `models/`. */
  stripModelPrefix?: boolean;
  /** Short hint shown under the API-key field. */
  keyHint: string;
}

export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
  anthropic: {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    adapter: 'anthropic',
    baseUrl: '',
    editableBaseUrl: false,
    keyHint: 'From console.anthropic.com → API Keys',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    adapter: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    editableBaseUrl: false,
    keyHint: 'From platform.openai.com → API Keys',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    adapter: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    editableBaseUrl: false,
    keyHint: 'From openrouter.ai → Keys (one key, many models)',
  },
  google: {
    id: 'google',
    label: 'Google AI Studio',
    adapter: 'openai-compatible',
    // Routed through the same-origin nginx/Vite proxy — Gemini sends no CORS header.
    baseUrl: '/ai-proxy/google/v1beta/openai',
    editableBaseUrl: false,
    stripModelPrefix: true,
    keyHint: 'From aistudio.google.com → Get API key',
  },
  custom: {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    adapter: 'openai-compatible',
    baseUrl: '',
    editableBaseUrl: true,
    keyHint: 'Any OpenAI-compatible endpoint (LM Studio, Together, etc.)',
  },
};

export const PROVIDER_ORDER: ProviderId[] = [
  'anthropic',
  'openai',
  'openrouter',
  'google',
  'custom',
];
