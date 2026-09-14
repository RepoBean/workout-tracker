import { HrDeviceInfo, HrHandlers, HrTransport } from './types';
import { parseHr, isPlausibleBpm } from './parseHr';

const HEART_RATE_SERVICE = 'heart_rate';
const HEART_RATE_MEASUREMENT = 'heart_rate_measurement';

export class WebBluetoothTransport implements HrTransport {
  readonly kind = 'web-bluetooth' as const;

  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private handlers: HrHandlers | null = null;
  private isSubscribed = false;

  private handleValueChanged = (event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target?.value) return;
    const bpm = parseHr(target.value);
    if (isPlausibleBpm(bpm)) {
      this.handlers?.onBpm(bpm);
    }
  };

  private cleanupListeners() {
    const char = this.characteristic;
    this.characteristic = null;
    this.isSubscribed = false;

    if (char) {
      try {
        char.removeEventListener('characteristicvaluechanged', this.handleValueChanged);
      } catch {
        // Ignored
      }
      try {
        char.stopNotifications().catch(() => {});
      } catch {
        // Ignored
      }
    }
  }

  private handleDisconnected = () => {
    this.cleanupListeners();
    const prevHandlers = this.handlers;
    this.device = null;
    prevHandlers?.onDisconnected();
  };

  private async subscribeToDevice(device: BluetoothDevice): Promise<HrDeviceInfo> {
    if (!device.gatt) throw new Error('Device has no GATT server');
    if (this.isSubscribed) {
      return { name: device.name ?? 'Heart Rate Monitor' };
    }

    this.isSubscribed = true;
    try {
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(HEART_RATE_SERVICE);
      const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', this.handleValueChanged);

      device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
      device.addEventListener('gattserverdisconnected', this.handleDisconnected);

      this.device = device;
      this.characteristic = characteristic;

      return { name: device.name ?? 'Heart Rate Monitor' };
    } catch (err) {
      this.isSubscribed = false;
      throw err;
    }
  }

  async connect(h: HrHandlers): Promise<HrDeviceInfo> {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      throw new Error('Bluetooth is not supported in this browser.');
    }
    this.handlers = h;

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [HEART_RATE_SERVICE] }],
      optionalServices: ['battery_service'],
    });

    return await this.subscribeToDevice(device);
  }

  async reconnect(h: HrHandlers): Promise<HrDeviceInfo | null> {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      return null;
    }
    this.handlers = h;

    const bt = navigator.bluetooth as Bluetooth & {
      getDevices?: () => Promise<BluetoothDevice[]>;
    };
    if (typeof bt.getDevices !== 'function') return null;

    try {
      const devices = await bt.getDevices();
      if (!devices || devices.length === 0) return null;

      for (const dev of devices) {
        if (dev.gatt?.connected) continue;
        try {
          return await this.subscribeToDevice(dev);
        } catch {
          // Try next device
        }
      }
    } catch {
      // getDevices not permitted or failed silently
    }
    return null;
  }

  async disconnect(): Promise<void> {
    this.cleanupListeners();
    const dev = this.device;
    if (dev) {
      dev.removeEventListener('gattserverdisconnected', this.handleDisconnected);
      if (dev.gatt?.connected) {
        try {
          dev.gatt.disconnect();
        } catch {
          // Ignored
        }
      }
    }
    this.device = null;
    this.handlers = null;
  }
}

export default new WebBluetoothTransport();
