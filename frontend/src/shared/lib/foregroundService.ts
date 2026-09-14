import { isNativeApp } from './platform';
import type { ServiceType } from '@capawesome-team/capacitor-android-foreground-service';

let isRunning = false;
let isStarting = false;
let serviceGeneration = 0;
let channelCreated = false;

export function isWorkoutServiceRunning(): boolean {
  return isRunning;
}

export async function startWorkoutService(): Promise<void> {
  if (!isNativeApp()) return;
  if (isRunning || isStarting) return;

  isStarting = true;
  const currentGen = ++serviceGeneration;

  try {
    const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service');
    if (currentGen !== serviceGeneration) return;

    // Ensure notification permission
    try {
      const perm = await ForegroundService.checkPermissions();
      if (currentGen !== serviceGeneration) return;
      if (perm.display !== 'granted') {
        await ForegroundService.requestPermissions();
        if (currentGen !== serviceGeneration) return;
      }
    } catch {
      // Best-effort permission check
    }

    // Ensure notification channel exists
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
    if (currentGen !== serviceGeneration) return;

    // Android foreground service type 16 = FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    // FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE — not in the plugin's enum
    await ForegroundService.startForegroundService({
      id: 1,
      title: 'Workout in progress',
      body: 'Heart rate and rest timer stay active',
      smallIcon: 'ic_stat_workout',
      notificationChannelId: 'workout-active',
      silent: true,
      serviceType: 16 as ServiceType,
    });

    if (currentGen !== serviceGeneration) {
      await ForegroundService.stopForegroundService();
      return;
    }

    isRunning = true;
  } catch (err) {
    isRunning = false;
    console.warn('[ForegroundService] Failed to start:', err);
  } finally {
    if (currentGen === serviceGeneration) {
      isStarting = false;
    }
  }
}

export async function stopWorkoutService(): Promise<void> {
  if (!isNativeApp()) return;
  ++serviceGeneration;
  isStarting = false;
  if (!isRunning) return;

  isRunning = false;
  try {
    const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service');
    await ForegroundService.stopForegroundService();
  } catch (err) {
    console.warn('[ForegroundService] Failed to stop:', err);
  }
}
