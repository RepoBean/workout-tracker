import { describe, it, expect } from 'vitest';
import { parseSessionIdParam, sessionToFetch } from './deepLink';

describe('parseSessionIdParam', () => {
  it('accepts positive integers', () => {
    expect(parseSessionIdParam('80')).toBe(80);
  });

  it('rejects missing, zero, negative and junk values', () => {
    for (const raw of [null, '', '0', '-3', 'abc', '1.5', '12x']) {
      expect(parseSessionIdParam(raw)).toBeUndefined();
    }
  });
});

describe('sessionToFetch', () => {
  const loaded = [{ id: 265 }, { id: 201 }, { id: 198 }];

  it('fetches a linked session older than the loaded list', () => {
    expect(sessionToFetch(80, loaded)).toBe(80);
  });

  it('does not fetch when the list already has it', () => {
    expect(sessionToFetch(201, loaded)).toBeNull();
  });

  it('waits for the list to load', () => {
    expect(sessionToFetch(80, undefined)).toBeNull();
  });

  it('does nothing without a link', () => {
    expect(sessionToFetch(undefined, loaded)).toBeNull();
  });

  it('fetches when the list is empty', () => {
    expect(sessionToFetch(80, [])).toBe(80);
  });
});
