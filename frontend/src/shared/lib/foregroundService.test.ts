import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const tick = () => new Promise((r) => setTimeout(r, 0));

vi.mock('./platform', () => ({ isNativeApp: () => true }));
vi.mock('@capawesome-team/capacitor-android-foreground-service', () => ({
  ForegroundService: {
    checkPermissions: async () => ({ display: 'granted' }),
    requestPermissions: async () => ({ display: 'granted' }),
    createNotificationChannel: async () => {},
    startForegroundService: async () => { await tick(); calls.push('start'); },
    stopForegroundService: async () => { await tick(); calls.push('stop'); },
  },
}));

async function load() {
  vi.resetModules();
  return import('./foregroundService');
}

async function settle() {
  for (let i = 0; i < 20; i++) await tick();
}

describe('foregroundService desired-state loop', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('starts once for repeated start requests', async () => {
    const fg = await load();
    fg.setWorkoutServiceActive(true);
    fg.setWorkoutServiceActive(true);
    await settle();
    expect(calls).toEqual(['start']);
    expect(fg.isWorkoutServiceRunning()).toBe(true);
  });

  it('a stop that arrives mid-start wins', async () => {
    const fg = await load();
    fg.setWorkoutServiceActive(true);
    await tick(); // let the start get in flight
    await fg.stopWorkoutService();
    // Either it never reached the plugin, or it did and was stopped after — never left up.
    expect([[], ['start', 'stop']]).toContainEqual(calls);
    expect(fg.isWorkoutServiceRunning()).toBe(false);
  });

  it('start → stop → start mid-flight ends running, and no stale stop kills it', async () => {
    const fg = await load();
    fg.setWorkoutServiceActive(true);
    fg.setWorkoutServiceActive(false);
    fg.setWorkoutServiceActive(true);
    await settle();
    expect(calls[calls.length - 1]).toBe('start');
    expect(fg.isWorkoutServiceRunning()).toBe(true);
  });
});
