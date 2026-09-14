/**
 * Parses Bluetooth standard Heart Rate Measurement characteristic DataView.
 * Bit 0 of flags determines format: 0 = 8-bit BPM, 1 = 16-bit BPM (little-endian).
 */
export function parseHr(value: DataView): number {
  const flags = value.getUint8(0);
  const is16Bit = (flags & 0x01) !== 0;
  return is16Bit ? value.getUint16(1, true) : value.getUint8(1);
}

/**
 * Validates that a parsed BPM is within plausible human range (1..250).
 */
export function isPlausibleBpm(bpm: number): boolean {
  return Number.isFinite(bpm) && bpm >= 1 && bpm <= 250;
}
