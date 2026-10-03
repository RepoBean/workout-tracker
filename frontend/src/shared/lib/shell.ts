import { isNativeApp } from './platform';
import { normalizeApiBaseUrl } from '../api/baseUrl';

/**
 * The Android shell's `window.WorkoutShell` (MainActivity / ShellInterface.java, B3).
 *
 * With a server saved in the shell, the app loads its UI from that server, so screen
 * changes reach the phone through ship.sh with no APK release. Always feature-checked:
 * the browser has no shell, and an older APK has none either.
 */
export interface WorkoutShell {
  getVersion(): number;
  getServerUrl(): string;
  setServerUrl(url: string): boolean;
  clearServerUrl(): void;
  restart(): void;
  openExternal(url: string): boolean;
}

export function getShell(): WorkoutShell | null {
  if (!isNativeApp()) return null;
  const shell = (window as { WorkoutShell?: WorkoutShell }).WorkoutShell;
  return shell && typeof shell.getServerUrl === 'function' ? shell : null;
}

/** "https://gym.example.com/" → "https://gym.example.com"; null when not a usable URL. */
export function toOrigin(raw: string): string | null {
  const normalized = normalizeApiBaseUrl(raw);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** The server the shell loads the UI from, or null (bundled UI, older APK, or a browser). */
export function shellServerUrl(shell: WorkoutShell | null = getShell()): string | null {
  const url = shell?.getServerUrl();
  return url ? url : null;
}

/** True when this page IS the shell's server — the API is same-origin, nothing to configure. */
export function isServedByShell(
  shell: WorkoutShell | null = getShell(),
  origin: string = window.location.origin
): boolean {
  const server = shellServerUrl(shell);
  return server !== null && toOrigin(server) === origin;
}

/** Save `url` as the shell's server and reload the app from it. False when not possible. */
export function switchShellServer(url: string, shell: WorkoutShell | null = getShell()): boolean {
  const origin = toOrigin(url);
  if (!shell || !origin || !shell.setServerUrl(origin)) return false;
  shell.restart();
  return true;
}

/** Forget the server and reload the bundled UI. */
export function switchToBundledUi(shell: WorkoutShell | null = getShell()): boolean {
  if (!shell) return false;
  shell.clearServerUrl();
  shell.restart();
  return true;
}

/**
 * First launch of a B3 APK over an older install: the bundled UI already has the server
 * address its API calls use (Settings → Server). Hand the UI over to that server once.
 * Returns true when a restart is under way (the caller should not render).
 */
export function handOffToSavedServer(
  savedApiBaseUrl: string,
  shell: WorkoutShell | null = getShell()
): boolean {
  if (!shell || shellServerUrl(shell) || !savedApiBaseUrl) return false;
  return switchShellServer(savedApiBaseUrl, shell);
}
