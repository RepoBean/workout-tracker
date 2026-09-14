import { isNativeApp } from './platform';

let isRunning = false;
let channelCreated = false;

export function isWorkoutServiceRunning(): boolean {
  return isRunning;
}

export async function startWorkoutService(): Promise<void> {
  if (!isNativeApp()) return;
  if (isRunning) return;

  isRunning = true;
  try {
    const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service');

    // Ensure notification permission
    try {
      const perm = await ForegroundService.checkPermissions();
      if (perm.display !== 'granted') {
        await ForegroundService.requestPermissions();
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

    // Android foreground service type 16 = FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    await ForegroundService.startForegroundService({
      id: 1,
      title: 'Workout in progress',
      body: 'Heart rate and rest timer stay active',
      smallIcon: 'ic_stat_workout',
      notificationChannelId: 'workout-active',
      silent: true,
      serviceType: 16 as unknown as any,
    });
  } catch (err) {
    isRunning = false;
    console.warn('[ForegroundService] Failed to start:', err);
  }
}

export async function stopWorkoutService(): Promise<void> {
  if (!isNativeApp()) return;
  if (!isRunning) return;

  isRunning = false;
  try {
    const { ForegroundService } = await import('@capawesome-team/capacitor-android-foreground-service');
    await ForegroundService.stopForegroundService();
  } catch (err) {
    console.warn('[ForegroundService] Failed to stop:', err);
  }
}
