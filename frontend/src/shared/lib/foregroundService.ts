import { isNativeApp } from './platform';
import type { ServiceType } from '@capawesome-team/capacitor-android-foreground-service';

// Desired-state model: callers say whether the service SHOULD run; one async loop at a
// time drives the plugin toward that. Start/stop calls can arrive in any order and
// interleave with in-flight bridge calls without a stale start killing a newer one.
let desired = false;
let desiredBody = '';
let running = false;
let reconciling: Promise<void> | null = null;
let channelCreated = false;

export function isWorkoutServiceRunning(): boolean {
  return running;
}

/** Ask for the service to run (with this notification body) or not. No-op on web. */
export function setWorkoutServiceActive(active: boolean, body = 'Heart rate stays connected'): void {
  if (!isNativeApp()) return;
  desired = active;
  desiredBody = body;
  if (!reconciling) {
    reconciling = reconcile().finally(() => {
      reconciling = null;
    });
  }
}

export async function stopWorkoutService(): Promise<void> {
  setWorkoutServiceActive(false);
  await reconciling;
}

async function reconcile(): Promise<void> {
  const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service');

  while (running !== desired) {
    if (desired) {
      try {
        await start(ForegroundService, desiredBody);
        running = true;
      } catch (err) {
        // Don't spin on a start that keeps failing (e.g. permission denied); the next
        // setWorkoutServiceActive(true) call retries.
        console.warn('[ForegroundService] Failed to start:', err);
        desired = false;
      }
    } else {
      try {
        await ForegroundService.stopForegroundService();
      } catch (err) {
        console.warn('[ForegroundService] Failed to stop:', err);
      }
      running = false;
    }
  }
}

type Plugin = typeof import('@capawesome-team/capacitor-android-foreground-service').ForegroundService;

async function start(ForegroundService: Plugin, body: string): Promise<void> {
  try {
    const perm = await ForegroundService.checkPermissions();
    if (perm.display !== 'granted') await ForegroundService.requestPermissions();
  } catch {
    // Best-effort permission check
  }

  if (!channelCreated) {
    try {
      await ForegroundService.createNotificationChannel({
        id: 'workout-active',
        name: 'Active Workout',
        description: 'Ongoing workout tracking',
        importance: 3, // Default importance
      });
      channelCreated = true;
    } catch {
      // Channel creation might fail or already exist
    }
  }

  await ForegroundService.startForegroundService({
    id: 1,
    title: 'Workout in progress',
    body,
    smallIcon: 'ic_stat_workout',
    notificationChannelId: 'workout-active',
    silent: true,
    // FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE — not in the plugin's enum
    serviceType: 16 as ServiceType,
  });
}
