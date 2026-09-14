import { describe, it, expect } from 'vitest';
import { parseHr, isPlausibleBpm } from './parseHr';

describe('parseHr', () => {
  it('parses 8-bit format (flag bit 0 is 0)', () => {
    // 2 bytes: flags (0x00 = 8-bit), bpm (72)
    const buffer = new ArrayBuffer(2);
    const view = new DataView(buffer);
    view.setUint8(0, 0x00);
    view.setUint8(1, 72);

    expect(parseHr(view)).toBe(72);
  });

  it('parses 16-bit format (flag bit 0 is 1, little-endian)', () => {
    // 3 bytes: flags (0x01 = 16-bit), uint16 little endian (165 = 0x00A5 -> 0xA5, 0x00)
    const buffer = new ArrayBuffer(3);
    const view = new DataView(buffer);
    view.setUint8(0, 0x01);
    view.setUint16(1, 165, true);

    expect(parseHr(view)).toBe(165);
  });

  it('handles other flag bits without affecting 8-bit/16-bit decision', () => {
    // Flag with sensor contact bits (e.g. 0x06 = 0b00000110, bit 0 is 0)
    const buffer8 = new ArrayBuffer(2);
    const view8 = new DataView(buffer8);
    view8.setUint8(0, 0b00011110);
    view8.setUint8(1, 130);
    expect(parseHr(view8)).toBe(130);

    // Flag with bit 0 set (e.g. 0b00011111)
    const buffer16 = new ArrayBuffer(3);
    const view16 = new DataView(buffer16);
    view16.setUint8(0, 0b00011111);
    view16.setUint16(1, 185, true);
    expect(parseHr(view16)).toBe(185);
  });
});

describe('isPlausibleBpm', () => {
  it('accepts values within 1..250', () => {
    expect(isPlausibleBpm(1)).toBe(true);
    expect(isPlausibleBpm(60)).toBe(true);
    expect(isPlausibleBpm(180)).toBe(true);
    expect(isPlausibleBpm(250)).toBe(true);
  });

  it('rejects values out of range or non-finite', () => {
    expect(isPlausibleBpm(0)).toBe(false);
    expect(isPlausibleBpm(-5)).toBe(false);
    expect(isPlausibleBpm(251)).toBe(false);
    expect(isPlausibleBpm(999)).toBe(false);
    expect(isPlausibleBpm(NaN)).toBe(false);
    expect(isPlausibleBpm(Infinity)).toBe(false);
  });
});
