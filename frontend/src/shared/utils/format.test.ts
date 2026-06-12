import { describe, expect, it } from 'vitest';
import { formatMMSS, parseDurationToSec } from './format';

describe('formatMMSS', () => {
  it('formats zero seconds', () => {
    expect(formatMMSS(0)).toBe('0:00');
  });

  it('zero-pads single-digit seconds', () => {
    expect(formatMMSS(59)).toBe('0:59');
  });

  it('rolls over to one minute', () => {
    expect(formatMMSS(60)).toBe('1:00');
  });

  it('formats mid-minute durations', () => {
    expect(formatMMSS(90)).toBe('1:30');
  });

  it('formats double-digit minutes with zero-padded seconds', () => {
    expect(formatMMSS(605)).toBe('10:05');
  });
});

describe('parseDurationToSec', () => {
  it('parses m:ss', () => {
    expect(parseDurationToSec('32:14')).toBe(1934);
  });

  it('parses minutes past an hour as m:ss', () => {
    expect(parseDurationToSec('90:00')).toBe(5400);
  });

  it('parses h:mm:ss', () => {
    expect(parseDurationToSec('1:02:30')).toBe(3750);
  });

  it('parses plain minutes', () => {
    expect(parseDurationToSec('30')).toBe(1800);
  });

  it('parses decimal minutes', () => {
    expect(parseDurationToSec('32.5')).toBe(1950);
  });

  it('trims whitespace', () => {
    expect(parseDurationToSec(' 5:00 ')).toBe(300);
  });

  it('round-trips formatMMSS output', () => {
    expect(parseDurationToSec(formatMMSS(1934))).toBe(1934);
  });

  it('rejects empty input', () => {
    expect(parseDurationToSec('')).toBeNull();
    expect(parseDurationToSec('   ')).toBeNull();
  });

  it('rejects zero and negative durations', () => {
    expect(parseDurationToSec('0')).toBeNull();
    expect(parseDurationToSec('0:00')).toBeNull();
    expect(parseDurationToSec('-5')).toBeNull();
  });

  it('rejects seconds of 60 or more after the leading unit', () => {
    expect(parseDurationToSec('5:75')).toBeNull();
    expect(parseDurationToSec('1:75:00')).toBeNull();
  });

  it('rejects malformed strings', () => {
    expect(parseDurationToSec('abc')).toBeNull();
    expect(parseDurationToSec('5:')).toBeNull();
    expect(parseDurationToSec(':30')).toBeNull();
    expect(parseDurationToSec('1:2:3:4')).toBeNull();
    expect(parseDurationToSec('5:3.5')).toBeNull();
  });
});
