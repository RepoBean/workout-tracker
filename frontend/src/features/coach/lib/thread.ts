import type { CoachMessage } from './providers/types';

/** A persisted, display-facing chat message (plain text only). */
export interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  /** A failed send shown in the thread. Never sent to the model (nor the user turn behind it). */
  error?: boolean;
}

/** Errors were stored as plain assistant text with this prefix before the `error` flag. */
const LEGACY_ERROR_PREFIX = '⚠️';

const STORAGE_KEY = 'workout-tracker-coach-thread';

/** Max messages kept in localStorage. */
const MAX_STORED = 40;

/** Max prior messages sent to the model (bounds token cost). */
const MAX_CONTEXT = 12;

export function loadThread(): DisplayMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is DisplayMessage =>
          m &&
          typeof m === 'object' &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string'
      )
      .map((m) => {
        const error =
          m.error === true ||
          (m.role === 'assistant' && m.content.startsWith(LEGACY_ERROR_PREFIX));
        return error ? { role: m.role, content: m.content, error } : { role: m.role, content: m.content };
      });
  } catch {
    return [];
  }
}

export function saveThread(messages: DisplayMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    // ignore quota errors
  }
}

export function clearThread(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Convert recent display history into the neutral message format for the loop.
 *
 * Failed sends stay visible in the UI but are not conversation: each error and the user
 * message that triggered it are dropped. The window then keeps the last MAX_CONTEXT
 * messages and starts on a user message (providers expect a user turn first, and a window
 * opening on a reply has lost its question).
 */
export function toCoachMessages(messages: DisplayMessage[]): CoachMessage[] {
  const kept: DisplayMessage[] = [];
  for (const m of messages) {
    if (m.error) {
      if (kept.at(-1)?.role === 'user') kept.pop();
      continue;
    }
    kept.push(m);
  }

  const window = kept.slice(-MAX_CONTEXT);
  const firstUser = window.findIndex((m) => m.role === 'user');
  return (firstUser === -1 ? [] : window.slice(firstUser)).map((m) =>
    m.role === 'user'
      ? { role: 'user', content: m.content }
      : { role: 'assistant', content: m.content, toolCalls: [] }
  );
}
