/**
 * Provider-neutral chat abstraction. Each adapter (Anthropic, OpenAI-compatible)
 * translates these shapes to/from its own wire format so the agentic loop and UI
 * never branch on provider.
 */

export interface ModelOption {
  id: string;
  label?: string;
}

/** A tool the model may call. `parameters` is a JSON Schema object. */
export interface ChatToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A tool call emitted by the model. */
export interface ChatToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /**
   * Opaque provider passthrough that must be echoed back unchanged on the next
   * turn. Gemini (via the OpenAI-compat layer) returns a signed reasoning token
   * here as `extra_content.google.thought_signature`; dropping it makes the
   * follow-up turn 400 with "Function call is missing a thought_signature".
   */
  extraContent?: Record<string, unknown>;
}

/**
 * Neutral conversation message. The loop appends these; adapters translate.
 * - `user`: a human turn (plain text)
 * - `assistant`: model turn — may carry text and/or tool calls
 * - `tool`: the result of executing one tool call (fed back to the model)
 */
export type CoachMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls: ChatToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface RunTurnArgs {
  system: string;
  messages: CoachMessage[];
  tools: ChatToolDef[];
  onTextDelta: (delta: string) => void;
}

export interface RunTurnResult {
  text: string;
  toolCalls: ChatToolCall[];
}

export interface ChatProvider {
  /** Fetch the provider's available models for the model picker. */
  listModels(): Promise<ModelOption[]>;
  /** Run a single assistant turn, streaming text and collecting tool calls. */
  runTurn(args: RunTurnArgs): Promise<RunTurnResult>;
}
