import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cloud.valgrind.vela',
  appName: 'Vela',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true, // Allow HTTP for local Jellyfin servers
  },
  android: {
    buildOptions: {
      releaseType: 'APK',
    },
    edgeToEdge: true,
  },
};

export default config;
