import { afterEach, describe, expect, it } from 'vitest';
import { loadThread, saveThread, toCoachMessages, type DisplayMessage } from './thread';

const user = (content: string): DisplayMessage => ({ role: 'user', content });
const coach = (content: string): DisplayMessage => ({ role: 'assistant', content });
const failed = (content: string): DisplayMessage => ({ role: 'assistant', content, error: true });

afterEach(() => localStorage.clear());

describe('toCoachMessages', () => {
  it('maps user/assistant turns to the neutral format', () => {
    expect(toCoachMessages([user('hi'), coach('hello')])).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello', toolCalls: [] },
    ]);
  });

  it('keeps the last 12 and never starts the window on an assistant message', () => {
    // 13 messages: u0 a0 u1 a1 ... u6 → slice(-12) would open on a0.
    const thread: DisplayMessage[] = [];
    for (let i = 0; i < 6; i++) thread.push(user(`u${i}`), coach(`a${i}`));
    thread.push(user('u6'));
    const out = toCoachMessages(thread);
    expect(out[0]).toEqual({ role: 'user', content: 'u1' });
    expect(out).toHaveLength(11);
    expect(out.at(-1)).toEqual({ role: 'user', content: 'u6' });
  });

  it('drops each error and the user message that triggered it', () => {
    const out = toCoachMessages([
      user('first'), coach('answer'),
      user('broken'), failed('⚠️ HTTP 529'),
      user('retry'),
    ]);
    expect(out.map((m) => m.content)).toEqual(['first', 'answer', 'retry']);
  });

  it('handles an error at the start of the thread', () => {
    expect(toCoachMessages([user('q'), failed('⚠️ boom'), user('again')])).toEqual([
      { role: 'user', content: 'again' },
    ]);
  });

  it('is empty when only errors remain', () => {
    expect(toCoachMessages([user('q'), failed('⚠️ boom')])).toEqual([]);
  });
});

describe('loadThread', () => {
  it('round-trips the error flag', () => {
    saveThread([user('q'), failed('⚠️ boom'), coach('fine')]);
    expect(loadThread()).toEqual([user('q'), failed('⚠️ boom'), coach('fine')]);
  });

  it('treats legacy warning-sign assistant messages as errors', () => {
    localStorage.setItem(
      'workout-tracker-coach-thread',
      JSON.stringify([user('q'), coach('⚠️ Chat request failed (HTTP 500)'), user('⚠️ my own text')])
    );
    const thread = loadThread();
    expect(thread[1].error).toBe(true);
    expect(thread[2].error).toBeUndefined();
    expect(toCoachMessages(thread)).toEqual([{ role: 'user', content: '⚠️ my own text' }]);
  });

  it('drops malformed entries', () => {
    localStorage.setItem('workout-tracker-coach-thread', JSON.stringify([user('ok'), { role: 'tool' }, null]));
    expect(loadThread()).toEqual([user('ok')]);
  });
});
