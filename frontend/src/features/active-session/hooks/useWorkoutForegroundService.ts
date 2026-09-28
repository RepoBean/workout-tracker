import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveSessionCheck } from '../../../shared/api/queries';
import { useHeartRate } from '../../../shared/context/HeartRateContext';
import { setWorkoutServiceActive } from '../../../shared/lib/foregroundService';
import { isNativeApp } from '../../../shared/lib/platform';

/**
 * Android only; mounted once at the app root. Keeps the "Workout in progress" foreground
 * service up for as long as the SERVER has an active session and the strap is connected —
 * not just while the session page is open, so going Home mid-workout no longer lets the
 * strap drop with the screen off. The strap gate is structural: the service type is
 * `connectedDevice`, which Android refuses without a live Bluetooth connection (the rest
 * timer uses AlarmManager and needs no service). Tapping the notification opens the workout.
 */
export function useWorkoutForegroundService() {
  const native = isNativeApp();
  const navigate = useNavigate();
  const { data: activeSession } = useActiveSessionCheck({ enabled: native });
  const { isConnected: hrConnected } = useHeartRate();

  const activeId = activeSession && !activeSession.completedAt ? activeSession.id : null;
  const startedAt = activeSession?.createdAt ?? null;

  useEffect(() => {
    if (!native) return;
    const on = activeId != null && hrConnected;
    const body = startedAt
      ? `Started ${new Date(startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · heart rate stays connected`
      : undefined;
    setWorkoutServiceActive(on, body);
  }, [native, activeId, startedAt, hrConnected]);

  // Notification tap → the workout. The plugin reopens the app itself; this routes it.
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  useEffect(() => {
    if (!native) return;
    let handle: { remove: () => Promise<void> } | null = null;
    let mounted = true;
    import('@capawesome-team/capacitor-android-foreground-service').then(({ ForegroundService }) =>
      ForegroundService.addListener('notificationTapped', () => {
        if (activeIdRef.current != null) navigate(`/workout/${activeIdRef.current}`);
      })
    ).then((h) => {
      if (mounted) handle = h;
      else void h.remove();
    }).catch(() => {
      // Listener is a convenience; the app still opens without it.
    });
    return () => {
      mounted = false;
      if (handle) void handle.remove();
    };
  }, [native, navigate]);
}
