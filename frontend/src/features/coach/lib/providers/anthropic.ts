import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatProvider,
  ChatToolCall,
  CoachMessage,
  ModelOption,
  RunTurnArgs,
  RunTurnResult,
} from './types';

const MAX_TOKENS = 1500;

/**
 * Translate neutral messages to Anthropic's format. Tool results must arrive in
 * a `user` turn directly after the assistant `tool_use`, and multiple results
 * from one assistant turn must share a single user message — so consecutive
 * `tool` messages are merged.
 */
function toAnthropicMessages(messages: CoachMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content });
      continue;
    }

    if (msg.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (msg.content.trim()) {
        blocks.push({ type: 'text', text: msg.content });
      }
      for (const call of msg.toolCalls) {
        blocks.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.input,
        });
      }
      // An assistant turn must have non-empty content.
      out.push({ role: 'assistant', content: blocks.length > 0 ? blocks : '…' });
      continue;
    }

    // tool result — merge into the preceding user message when possible
    const resultBlock: Anthropic.ContentBlockParam = {
      type: 'tool_result',
      tool_use_id: msg.toolCallId,
      content: msg.content,
    };
    const last = out[out.length - 1];
    if (last && last.role === 'user' && Array.isArray(last.content)) {
      last.content.push(resultBlock);
    } else {
      out.push({ role: 'user', content: [resultBlock] });
    }
  }

  return out;
}

export function createAnthropicProvider(opts: { apiKey: string; model: string }): ChatProvider {
  const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });

  return {
    async listModels(): Promise<ModelOption[]> {
      const page = await client.models.list({ limit: 100 });
      return page.data.map((m) => ({ id: m.id, label: m.display_name }));
    },

    async runTurn({ system, messages, tools, onTextDelta }: RunTurnArgs): Promise<RunTurnResult> {
      // Deliberately omit `thinking`: it is model-gated and 400s on some
      // user-selectable models (e.g. Haiku). Omitting it maximizes compatibility.
      const stream = client.messages.stream({
        model: opts.model,
        max_tokens: MAX_TOKENS,
        system,
        messages: toAnthropicMessages(messages),
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool.InputSchema,
        })),
      });

      stream.on('text', (delta) => onTextDelta(delta));

      const final = await stream.finalMessage();

      let text = '';
      const toolCalls: ChatToolCall[] = [];
      for (const block of final.content) {
        if (block.type === 'text') {
          text += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }

      return { text, toolCalls };
    },
  };
}
