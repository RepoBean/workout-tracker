import type { CardioModality } from './types';

/**
 * Display labels for each cardio modality. Two vocabularies are kept side
 * by side because UI surfaces use different conventions:
 *  - `long` is the human-readable name shown in pickers and forms.
 *  - `short` is the terse label used when seeding an ad-hoc cardio
 *    exercise from the dashboard cardio modality picker.
 */
export const CARDIO_MODALITY_INFO: Record<CardioModality, { long: string; short: string }> = {
  running: { long: 'Running', short: 'Run' },
  cycling: { long: 'Cycling', short: 'Ride' },
  treadmill: { long: 'Treadmill', short: 'Treadmill' },
  rowing: { long: 'Rowing', short: 'Row' },
  other: { long: 'Other', short: 'Cardio' },
};

/**
 * Ordered list of `{ value, label }` entries using the long labels.
 * Convenient for rendering picker buttons / form modality lists.
 */
export const CARDIO_MODALITY_OPTIONS: { value: CardioModality; label: string }[] =
  (Object.keys(CARDIO_MODALITY_INFO) as CardioModality[]).map(value => ({
    value,
    label: CARDIO_MODALITY_INFO[value].long,
  }));
