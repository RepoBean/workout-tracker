/** True inside the Android app; false in any browser (incl. jsdom tests). */
export function isNativeApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  );
}
