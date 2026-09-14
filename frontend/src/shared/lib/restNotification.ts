import { isNativeApp } from './platform';

const REST_TIMER_NOTIFICATION_ID = 1001;
const REST_TIMER_CHANNEL_ID = 'rest-timer';

let channelCreated = false;
let lastScheduledTime: number | null = null;

export function getLastScheduledNotificationTime(): number | null {
  return lastScheduledTime;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return true;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === 'granted';
  } catch {
    return false;
  }
}

export async function checkExactNotificationSetting(): Promise<string> {
  if (!isNativeApp()) return 'not-native';
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const status = await LocalNotifications.checkExactNotificationSetting();
    return status.exact_alarm ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function changeExactNotificationSetting(): Promise<string> {
  if (!isNativeApp()) return 'not-native';
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const status = await LocalNotifications.changeExactNotificationSetting();
    return status.exact_alarm ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function ensureChannel(): Promise<void> {
  if (channelCreated) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.createChannel({
      id: REST_TIMER_CHANNEL_ID,
      name: 'Rest Timer',
      description: 'Alerts when your rest timer finishes',
      importance: 5, // High importance for heads-up notification
      vibration: true,
      visibility: 1, // NotificationVisibility.Public
    });
    channelCreated = true;
  } catch {
    // Ignored
  }
}

export async function scheduleRestNotification(endTimeMs: number): Promise<void> {
  if (!isNativeApp()) return;
  lastScheduledTime = endTimeMs;
  try {
    await ensureChannel();
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_TIMER_NOTIFICATION_ID,
          title: 'Rest complete',
          body: 'Time for your next set',
          channelId: REST_TIMER_CHANNEL_ID,
          schedule: {
            at: new Date(endTimeMs),
            allowWhileIdle: true,
          },
        },
      ],
    });
  } catch {
    // Failed to schedule
  }
}

export async function cancelRestNotification(): Promise<void> {
  if (!isNativeApp()) return;
  lastScheduledTime = null;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({
      notifications: [{ id: REST_TIMER_NOTIFICATION_ID }],
    });
  } catch {
    // Ignored
  }
}
