import { Capacitor } from '@capacitor/core';

/** True inside the Android app; false in any browser (incl. jsdom tests). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
