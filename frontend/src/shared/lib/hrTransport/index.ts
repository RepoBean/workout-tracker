import { isNativeApp } from '../platform';
import { HrTransport } from './types';

export * from './types';
export * from './parseHr';

let transportPromise: Promise<HrTransport> | null = null;

export function getHrTransport(): Promise<HrTransport> {
  if (!transportPromise) {
    transportPromise = (async () => {
      if (isNativeApp()) {
        const mod = await import('./nativeBle');
        return mod.default;
      } else {
        const mod = await import('./webBluetooth');
        return mod.default;
      }
    })();
  }
  return transportPromise;
}

export function isHrSupported(): boolean {
  return isNativeApp() || (typeof navigator !== 'undefined' && 'bluetooth' in navigator);
}
