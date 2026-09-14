export interface HrHandlers {
  onBpm(bpm: number): void;        // one validated reading (1..250)
  onDisconnected(): void;          // link dropped, not user-initiated
}

export interface HrDeviceInfo {
  name: string;
}

export interface HrTransport {
  readonly kind: 'web-bluetooth' | 'native-ble';
  /** Show the OS/browser chooser, connect, subscribe to HR notifications. */
  connect(h: HrHandlers): Promise<HrDeviceInfo>;
  /** Silent reconnect to a previously used strap; null if none or it failed. */
  reconnect(h: HrHandlers): Promise<HrDeviceInfo | null>;
  disconnect(): Promise<void>;
}
