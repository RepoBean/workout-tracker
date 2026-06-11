import type { CoachMessage } from './providers/types';

/** A persisted, display-facing chat message (plain text only). */
export interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

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
    return parsed.filter(
      (m): m is DisplayMessage =>
        m &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    );
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

/** Convert recent display history into the neutral message format for the loop. */
export function toCoachMessages(messages: DisplayMessage[]): CoachMessage[] {
  return messages.slice(-MAX_CONTEXT).map((m) =>
    m.role === 'user'
      ? { role: 'user', content: m.content }
      : { role: 'assistant', content: m.content, toolCalls: [] }
  );
}
