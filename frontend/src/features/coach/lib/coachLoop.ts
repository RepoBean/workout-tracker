import type { ChatProvider, ChatToolCall, ChatToolDef, CoachMessage } from './providers/types';

const MAX_ITERATIONS = 6;

export interface RunCoachArgs {
  provider: ChatProvider;
  system: string;
  /** Conversation so far (user/assistant/tool messages), oldest first. */
  messages: CoachMessage[];
  tools: ChatToolDef[];
  executeTool: (call: ChatToolCall) => Promise<string>;
  /** Called at the start of each assistant turn — clear the streaming buffer. */
  onTurnStart?: () => void;
  /** Streamed assistant text for the current turn. */
  onTextDelta: (delta: string) => void;
  /** Called before a tool runs so the UI can show a status line. */
  onToolStart?: (call: ChatToolCall) => void;
}

export interface RunCoachResult {
  /** The full conversation including new assistant/tool messages. */
  messages: CoachMessage[];
  /** The final assistant text (the answer shown to the user). */
  finalText: string;
}

/**
 * Provider-neutral agentic loop: run a turn, execute any tool calls, feed the
 * results back, and repeat until the model answers with no further tool calls
 * (or the iteration cap is hit).
 */
export async function runCoach(args: RunCoachArgs): Promise<RunCoachResult> {
  const convo: CoachMessage[] = [...args.messages];
  let finalText = '';

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    args.onTurnStart?.();
    const { text, toolCalls } = await args.provider.runTurn({
      system: args.system,
      messages: convo,
      tools: args.tools,
      onTextDelta: args.onTextDelta,
    });

    convo.push({ role: 'assistant', content: text, toolCalls });
    finalText = text;

    if (toolCalls.length === 0) {
      return { messages: convo, finalText };
    }

    for (const call of toolCalls) {
      args.onToolStart?.(call);
      const result = await args.executeTool(call);
      convo.push({ role: 'tool', toolCallId: call.id, name: call.name, content: result });
    }
  }

  // Hit the iteration cap with tools still pending — return whatever text we have.
  return {
    messages: convo,
    finalText: finalText || "I gathered your data but ran out of steps — ask me again and I'll summarize.",
  };
}
