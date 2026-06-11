import type {
  ChatProvider,
  ChatToolCall,
  CoachMessage,
  ModelOption,
  RunTurnArgs,
  RunTurnResult,
} from './types';

interface OpenAiToolCallPayload {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  // Gemini's thought_signature round-trips here; harmless/ignored by others.
  extra_content?: Record<string, unknown>;
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAiToolCallPayload[];
  tool_call_id?: string;
}

interface StreamToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
  extra_content?: Record<string, unknown>;
}

interface StreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: StreamToolCallDelta[];
    };
  }>;
}

interface ModelsResponse {
  data?: Array<{ id: string }>;
}

function toOpenAiMessages(system: string, messages: CoachMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: system }];

  for (const msg of messages) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      const toolCalls = msg.toolCalls.map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: JSON.stringify(c.input) },
        // Echo Gemini's thought_signature back verbatim, or the next turn 400s.
        ...(c.extraContent ? { extra_content: c.extraContent } : {}),
      }));
      out.push({
        role: 'assistant',
        content: msg.content || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    } else {
      out.push({ role: 'tool', tool_call_id: msg.toolCallId, content: msg.content });
    }
  }

  return out;
}

function safeParseInput(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function createOpenAiCompatibleProvider(opts: {
  apiKey: string;
  model: string;
  baseUrl: string;
  stripModelPrefix?: boolean;
}): ChatProvider {
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.apiKey}`,
  };

  return {
    async listModels(): Promise<ModelOption[]> {
      const res = await fetch(`${baseUrl}/models`, { headers: authHeaders });
      if (!res.ok) {
        throw new Error(`Could not list models (HTTP ${res.status})`);
      }
      const json = (await res.json()) as ModelsResponse;
      const data = json.data ?? [];
      return data.map((m) => {
        const id = opts.stripModelPrefix ? m.id.replace(/^models\//, '') : m.id;
        return { id };
      });
    },

    async runTurn({ system, messages, tools, onTextDelta }: RunTurnArgs): Promise<RunTurnResult> {
      const body = {
        model: opts.model,
        stream: true,
        messages: toOpenAiMessages(system, messages),
        tools: tools.map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
      };

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Chat request failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      const toolAcc: Record<
        number,
        { id: string; name: string; args: string; extraContent?: Record<string, unknown> }
      > = {};

      const handleData = (data: string) => {
        if (data === '[DONE]') return;
        let chunk: StreamChunk;
        try {
          chunk = JSON.parse(data) as StreamChunk;
        } catch {
          return;
        }
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) return;
        if (delta.content) {
          text += delta.content;
          onTextDelta(delta.content);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const acc = (toolAcc[idx] ??= { id: '', name: '', args: '' });
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.args += tc.function.arguments;
            if (tc.extra_content) acc.extraContent = tc.extra_content;
          }
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          handleData(trimmed.slice(5).trim());
        }
      }

      const toolCalls: ChatToolCall[] = Object.values(toolAcc)
        .filter((a) => a.name)
        .map((a) => ({
          id: a.id || a.name,
          name: a.name,
          input: safeParseInput(a.args),
          ...(a.extraContent ? { extraContent: a.extraContent } : {}),
        }));

      return { text, toolCalls };
    },
  };
}
