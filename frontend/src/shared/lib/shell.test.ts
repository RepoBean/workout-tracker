import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getShell,
  handOffToSavedServer,
  isServedByShell,
  switchShellServer,
  switchToBundledUi,
  toOrigin,
  type WorkoutShell,
} from './shell';

function fakeShell(serverUrl = ''): WorkoutShell & { saved: string } {
  const shell = {
    saved: serverUrl,
    getVersion: () => 1,
    getServerUrl: () => shell.saved,
    setServerUrl: vi.fn((url: string) => {
      shell.saved = url;
      return true;
    }),
    clearServerUrl: vi.fn(() => {
      shell.saved = '';
    }),
    restart: vi.fn(),
    openExternal: vi.fn(() => true),
  };
  return shell;
}

afterEach(() => {
  delete (window as { WorkoutShell?: unknown }).WorkoutShell;
  delete (window as { Capacitor?: unknown }).Capacitor;
});

describe('toOrigin', () => {
  it('reduces to scheme://host[:port]', () => {
    expect(toOrigin('https://gym.bootyhole23.com/')).toBe('https://gym.bootyhole23.com');
    expect(toOrigin(' https://gym.bootyhole23.com/settings ')).toBe('https://gym.bootyhole23.com');
    expect(toOrigin('10.0.0.5:8035')).toBe('http://10.0.0.5:8035');
  });

  it('rejects nothing useful', () => {
    expect(toOrigin('')).toBeNull();
    expect(toOrigin('   ')).toBeNull();
  });
});

describe('getShell', () => {
  it('is null in a browser even if something sets window.WorkoutShell', () => {
    (window as { WorkoutShell?: unknown }).WorkoutShell = fakeShell();
    expect(getShell()).toBeNull();
  });

  it('is the shell inside the app, null with an older APK', () => {
    (window as { Capacitor?: unknown }).Capacitor = { isNativePlatform: () => true };
    expect(getShell()).toBeNull();
    const shell = fakeShell();
    (window as { WorkoutShell?: unknown }).WorkoutShell = shell;
    expect(getShell()).toBe(shell);
  });
});

describe('isServedByShell', () => {
  it('matches the page origin against the saved server', () => {
    const shell = fakeShell('https://gym.bootyhole23.com');
    expect(isServedByShell(shell, 'https://gym.bootyhole23.com')).toBe(true);
    expect(isServedByShell(shell, 'https://localhost')).toBe(false);
    expect(isServedByShell(fakeShell(''), 'https://localhost')).toBe(false);
    expect(isServedByShell(null, 'https://gym.bootyhole23.com')).toBe(false);
  });
});

describe('switching', () => {
  it('saves the origin and restarts', () => {
    const shell = fakeShell();
    expect(switchShellServer('https://gym-e.bootyhole23.com/', shell)).toBe(true);
    expect(shell.setServerUrl).toHaveBeenCalledWith('https://gym-e.bootyhole23.com');
    expect(shell.restart).toHaveBeenCalledOnce();
  });

  it('does not restart when the shell refuses the URL', () => {
    const shell = fakeShell();
    shell.setServerUrl = vi.fn(() => false);
    expect(switchShellServer('https://x.example', shell)).toBe(false);
    expect(shell.restart).not.toHaveBeenCalled();
  });

  it('back to the bundled UI clears and restarts', () => {
    const shell = fakeShell('https://gym.bootyhole23.com');
    expect(switchToBundledUi(shell)).toBe(true);
    expect(shell.saved).toBe('');
    expect(shell.restart).toHaveBeenCalledOnce();
  });
});

describe('handOffToSavedServer', () => {
  it('hands the bundled UI over to the server it already talks to, once', () => {
    const shell = fakeShell();
    expect(handOffToSavedServer('https://gym.bootyhole23.com', shell)).toBe(true);
    expect(shell.saved).toBe('https://gym.bootyhole23.com');
    expect(handOffToSavedServer('https://gym.bootyhole23.com', shell)).toBe(false);
  });

  it('stays away after the user chose the built-in app', () => {
    const shell = fakeShell();
    shell.isBundledByChoice = () => true;
    expect(handOffToSavedServer('https://gym.bootyhole23.com', shell)).toBe(false);
    expect(shell.restart).not.toHaveBeenCalled();
  });

  it('does nothing without a shell, a saved address, or once a server is set', () => {
    expect(handOffToSavedServer('https://gym.bootyhole23.com', null)).toBe(false);
    expect(handOffToSavedServer('', fakeShell())).toBe(false);
    const chosen = fakeShell('https://gym-e.bootyhole23.com');
    expect(handOffToSavedServer('https://gym.bootyhole23.com', chosen)).toBe(false);
    expect(chosen.restart).not.toHaveBeenCalled();
  });
});
