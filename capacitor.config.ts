import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jellyfin_v4lgrind_client.app',
  appName: 'Jellyfin V4lgrind',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true, // Allow HTTP for local Jellyfin servers
  },
  android: {
    buildOptions: {
      releaseType: 'APK',
    },
  },
};

export default config;
