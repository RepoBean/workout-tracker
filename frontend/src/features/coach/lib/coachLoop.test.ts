import { describe, expect, it, vi } from 'vitest';
import { runCoach, TRUNCATED_NOTE } from './coachLoop';
import type { ChatProvider, RunTurnResult } from './providers/types';

function provider(turns: RunTurnResult[]): ChatProvider {
  const queue = [...turns];
  return {
    listModels: async () => [],
    runTurn: vi.fn(async () => queue.shift() as RunTurnResult),
  };
}

const base = {
  system: 'persona',
  messages: [{ role: 'user' as const, content: 'hi' }],
  tools: [],
  onTextDelta: () => {},
};

describe('runCoach', () => {
  it('runs tools until the model answers without any', async () => {
    const executeTool = vi.fn(async () => 'result');
    const result = await runCoach({
      ...base,
      provider: provider([
        { text: '', toolCalls: [{ id: 't1', name: 'get_workout_history', input: {} }] },
        { text: 'Done.', toolCalls: [] },
      ]),
      executeTool,
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(result.finalText).toBe('Done.');
    expect(result.truncated).toBeUndefined();
  });

  it('on a truncated turn, skips its tool calls, stops, and says it was cut off', async () => {
    const executeTool = vi.fn(async () => 'result');
    const p = provider([
      {
        text: 'Here is your plan',
        toolCalls: [{ id: 't1', name: 'propose_program', input: { partial: true } }],
        truncated: true,
      },
      { text: 'never reached', toolCalls: [] },
    ]);
    const result = await runCoach({ ...base, provider: p, executeTool });
    expect(executeTool).not.toHaveBeenCalled();
    expect(p.runTurn).toHaveBeenCalledTimes(1);
    expect(result.truncated).toBe(true);
    expect(result.finalText).toBe(`Here is your plan\n\n${TRUNCATED_NOTE}`);
    expect(result.messages.at(-1)).toEqual({ role: 'assistant', content: 'Here is your plan', toolCalls: [] });
  });

  it('a truncated turn with no text still explains itself', async () => {
    const result = await runCoach({
      ...base,
      provider: provider([{ text: '', toolCalls: [], truncated: true }]),
      executeTool: async () => '',
    });
    expect(result.finalText).toBe(TRUNCATED_NOTE);
  });
});
