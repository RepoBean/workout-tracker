import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleProvider } from './openaiCompatible';

/** Runs one turn against a stubbed fetch and returns the JSON body it sent. */
async function sentBody(enableAnthropicCacheControl?: boolean): Promise<{ messages: Array<{ role: string; content: unknown }> }> {
  const fetchMock = vi.fn(async () => new Response('data: [DONE]\n\n', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const provider = createOpenAiCompatibleProvider({
    apiKey: 'k',
    model: 'anthropic/claude-sonnet',
    baseUrl: 'https://openrouter.ai/api/v1',
    enableAnthropicCacheControl,
  });
  await provider.runTurn({
    system: 'PERSONA',
    systemCacheable: 'DOSSIER',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    onTextDelta: () => {},
  });
  const init = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init[1].body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openaiCompatible system message', () => {
  it('puts a cache_control breakpoint after the dossier when enabled', async () => {
    const body = await sentBody(true);
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: [
        { type: 'text', text: 'PERSONA' },
        { type: 'text', text: 'DOSSIER', cache_control: { type: 'ephemeral' } },
      ],
    });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('keeps the plain string by default', async () => {
    const body = await sentBody();
    expect(body.messages[0]).toEqual({ role: 'system', content: 'PERSONA\n\nDOSSIER' });
  });
});
