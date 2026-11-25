import { Capacitor } from '@capacitor/core';

/**
 * Supported targets are Android, Windows and Linux. `dev` is the app opened in a
 * plain browser (npm run dev, e2e tests, screenshots): a development tool only.
 */
export type ClientPlatform = 'android' | 'linux' | 'windows' | 'dev';

interface ClientDeviceInfo {
  clientName: string;
  deviceIdPrefix: string;
  deviceName: string;
}

const desktopPlatform = typeof window !== 'undefined' ? window.desktopRuntime?.platform : undefined;
const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const isDesktop = Boolean(desktopPlatform);

export function getClientPlatform(): ClientPlatform {
  if (isAndroid) return 'android';
  if (desktopPlatform === 'win32') return 'windows';
  if (desktopPlatform === 'linux') return 'linux';
  return 'dev';
}

const DEVICE_INFO: Record<ClientPlatform, ClientDeviceInfo> = {
  android: { clientName: 'Vela Android', deviceIdPrefix: 'jellyfin-android', deviceName: 'Android' },
  windows: { clientName: 'Vela Desktop', deviceIdPrefix: 'jellyfin-windows', deviceName: 'Windows' },
  linux: { clientName: 'Vela Desktop', deviceIdPrefix: 'jellyfin-linux', deviceName: 'Linux' },
  dev: { clientName: 'Vela Dev', deviceIdPrefix: 'jellyfin-dev', deviceName: 'Dev browser' },
};

export function getClientDeviceInfo(): ClientDeviceInfo {
  return DEVICE_INFO[getClientPlatform()];
}

export function usePlatform() {
  return {
    isAndroid,
    isDesktop,
    isNative: isAndroid,
    platform: getClientPlatform(),
  };
}
