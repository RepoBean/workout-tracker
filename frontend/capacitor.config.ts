import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.repobean.workouttracker',
  appName: 'Workout Tracker',
  webDir: 'dist',
  server: { cleartext: true },          // API is plain http over the VPN
  android: { allowMixedContent: true }, // https://localhost WebView → http:// API
};

export default config;
