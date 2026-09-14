import { useState, useEffect, useCallback } from 'react';
import { Button } from '../../../shared/ui/Button';
import { useToast } from '../../../shared/ui/Toast';
import { useHeartRate } from '../../../shared/context/HeartRateContext';
import { getHrTransport } from '../../../shared/lib/hrTransport';
import { getApiBaseUrl } from '../../../shared/api/baseUrl';
import { isWorkoutServiceRunning } from '../../../shared/lib/foregroundService';
import {
  ensureNotificationPermission,
  checkExactNotificationSetting,
  changeExactNotificationSetting,
  getLastScheduledNotificationTime,
} from '../../../shared/lib/restNotification';

export function AndroidCard() {
  const toast = useToast();
  const { isConnected, deviceName, samplesSince } = useHeartRate();

  const [platform, setPlatform] = useState<string>('android');
  const [transportKind, setTransportKind] = useState<string>('unknown');
  const [exactAlarmState, setExactAlarmState] = useState<string>('checking...');
  const [lastTick, setLastTick] = useState<number>(Date.now());

  const refreshAsync = useCallback(async () => {
    try {
      const { Capacitor } = await import('@capacitor/core');
      setPlatform(Capacitor.getPlatform());
    } catch {
      setPlatform('android');
    }

    try {
      const transport = await getHrTransport();
      setTransportKind(transport.kind);
    } catch {
      setTransportKind('unknown');
    }

    try {
      const exact = await checkExactNotificationSetting();
      setExactAlarmState(exact);
    } catch {
      setExactAlarmState('unknown');
    }

    setLastTick(Date.now());
  }, []);

  useEffect(() => {
    void refreshAsync();
    const interval = setInterval(() => {
      void refreshAsync();
    }, 2000);
    return () => clearInterval(interval);
  }, [refreshAsync]);

  const handleRequestNotificationPermission = async () => {
    const granted = await ensureNotificationPermission();
    toast.info(`Notification permission: ${granted ? 'Granted' : 'Denied'}`);
    await refreshAsync();
  };

  const handleAllowExactAlarms = async () => {
    const result = await changeExactNotificationSetting();
    toast.info(`Exact alarm setting: ${result}`);
    await refreshAsync();
  };

  // Diagnostic calculations
  const samples60 = samplesSince(Date.now() - 60_000);
  const samples15m = samplesSince(Date.now() - 15 * 60 * 1000);

  let secondsSinceLastSample = 'N/A';
  if (samples15m.length > 0) {
    const lastTs = samples15m[samples15m.length - 1].ts;
    const sec = Math.max(0, Math.round((Date.now() - lastTs) / 1000));
    secondsSinceLastSample = `${sec}s`;
  }

  let largestGap = 'N/A';
  if (samples15m.length > 1) {
    let maxGapMs = 0;
    for (let i = 1; i < samples15m.length; i++) {
      const gapMs = samples15m[i].ts - samples15m[i - 1].ts;
      if (gapMs > maxGapMs) {
        maxGapMs = gapMs;
      }
    }
    largestGap = `${(maxGapMs / 1000).toFixed(1)}s`;
  } else if (samples15m.length === 1) {
    largestGap = '0.0s (1 sample)';
  }

  const fgRunning = isWorkoutServiceRunning();
  const lastScheduled = getLastScheduledNotificationTime();
  const lastScheduledStr = lastScheduled ? new Date(lastScheduled).toLocaleTimeString() : 'None';
  const apiBaseUrl = getApiBaseUrl() || '(same-origin/empty)';

  const diagnosticsText = [
    '=== Workout Tracker Android Diagnostics ===',
    `Timestamp: ${new Date().toISOString()}`,
    `Platform: ${platform}`,
    `API Base URL: ${apiBaseUrl}`,
    `HR Transport: ${transportKind}`,
    `Connected: ${isConnected ? 'Yes' : 'No'} (${deviceName ?? 'None'})`,
    `Samples in last 60s: ${samples60.length}`,
    `Seconds since last sample: ${secondsSinceLastSample}`,
    `Largest gap (last 15m): ${largestGap}`,
    `Foreground service running: ${fgRunning ? 'Yes' : 'No'}`,
    `Last scheduled notification: ${lastScheduledStr}`,
    `Exact-alarm state: ${exactAlarmState}`,
  ].join('\n');

  const handleCopyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsText);
      toast.success('Diagnostics copied to clipboard');
    } catch {
      toast.error('Failed to copy diagnostics');
    }
  };

  return (
    <div className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Android Native Settings
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Permissions, background tracking controls, and runtime diagnostics.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleRequestNotificationPermission}
          >
            Notification permission
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAllowExactAlarms}
          >
            Allow exact timer alarms
          </Button>
        </div>

        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg text-xs text-amber-800 dark:text-amber-200">
          <span className="font-semibold">Battery optimization:</span> To prevent Android from
          suspending heart-rate logging and rest timers when the screen is off, set the app's
          battery usage to <strong>Unrestricted</strong> (Settings → Apps → Workout Tracker →
          Battery / App battery usage → Unrestricted).
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-white/[0.06]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Live Diagnostics
          </h3>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
            Refreshed {new Date(lastTick).toLocaleTimeString()}
          </span>
        </div>

        <pre className="p-3 bg-gray-50 dark:bg-surface-800 border border-gray-200 dark:border-white/[0.06] rounded-lg font-mono text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {diagnosticsText}
        </pre>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={handleCopyDiagnostics}
        >
          Copy diagnostics
        </Button>
      </div>
    </div>
  );
}
