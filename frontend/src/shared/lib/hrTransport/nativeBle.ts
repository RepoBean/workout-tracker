import { BleClient } from '@capacitor-community/bluetooth-le';
import { HrDeviceInfo, HrHandlers, HrTransport } from './types';
import { parseHr, isPlausibleBpm } from './parseHr';

const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';
const STORAGE_KEY = 'wt:hr-native-device';

export class NativeBleTransport implements HrTransport {
  readonly kind = 'native-ble' as const;

  private connectedDeviceId: string | null = null;
  private handlers: HrHandlers | null = null;
  private isInitialized = false;

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await BleClient.initialize({ androidNeverForLocation: true });
      this.isInitialized = true;
    }
  }

  private handleDisconnect = (deviceId: string) => {
    if (this.connectedDeviceId === deviceId) {
      this.connectedDeviceId = null;
      const prevHandlers = this.handlers;
      this.handlers = null;
      prevHandlers?.onDisconnected();
    }
  };

  async connect(h: HrHandlers): Promise<HrDeviceInfo> {
    await this.ensureInitialized();
    this.handlers = h;

    const device = await BleClient.requestDevice({
      services: [HR_SERVICE],
    });

    const deviceId = device.deviceId;
    const name = device.name ?? 'Heart Rate Monitor';

    await BleClient.connect(deviceId, this.handleDisconnect);
    this.connectedDeviceId = deviceId;

    // Persist device ID and name for silent reconnect
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ deviceId, name }));
    } catch {
      // Ignored
    }

    await BleClient.startNotifications(
      deviceId,
      HR_SERVICE,
      HR_MEASUREMENT,
      (value: DataView) => {
        const bpm = parseHr(value);
        if (isPlausibleBpm(bpm)) {
          this.handlers?.onBpm(bpm);
        }
      }
    );

    return { name };
  }

  async reconnect(h: HrHandlers): Promise<HrDeviceInfo | null> {
    await this.ensureInitialized();
    this.handlers = h;

    let stored: { deviceId: string; name: string } | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!stored?.deviceId) return null;

    try {
      const { deviceId, name } = stored;
      await BleClient.connect(deviceId, this.handleDisconnect);
      this.connectedDeviceId = deviceId;

      await BleClient.startNotifications(
        deviceId,
        HR_SERVICE,
        HR_MEASUREMENT,
        (value: DataView) => {
          const bpm = parseHr(value);
          if (isPlausibleBpm(bpm)) {
            this.handlers?.onBpm(bpm);
          }
        }
      );

      return { name: name || 'Heart Rate Monitor' };
    } catch {
      this.connectedDeviceId = null;
      return null;
    }
  }

  async disconnect(): Promise<void> {
    const deviceId = this.connectedDeviceId;
    this.connectedDeviceId = null;
    this.handlers = null;

    if (deviceId) {
      try {
        await BleClient.stopNotifications(deviceId, HR_SERVICE, HR_MEASUREMENT);
      } catch {
        // Ignored
      }
      try {
        await BleClient.disconnect(deviceId);
      } catch {
        // Ignored
      }
    }
  }
}

export default new NativeBleTransport();
