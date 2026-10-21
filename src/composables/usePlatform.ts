import { Capacitor } from '@capacitor/core';

export type ClientPlatform = 'android' | 'linux' | 'macos' | 'web' | 'windows';

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
  if (desktopPlatform === 'darwin') return 'macos';
  return 'web';
}

export function getClientDeviceInfo(): ClientDeviceInfo {
  const platform = getClientPlatform();

  if (platform === 'android') {
    return {
      clientName: 'Vela Android',
      deviceIdPrefix: 'jellyfin-android',
      deviceName: 'Android',
    };
  }

  if (isDesktop) {
    const desktopName = platform === 'macos'
      ? 'macOS'
      : `${platform.charAt(0).toUpperCase()}${platform.slice(1)}`;
    return {
      clientName: 'Vela Desktop',
      deviceIdPrefix: `jellyfin-${platform}`,
      deviceName: desktopName,
    };
  }

  return {
    clientName: 'Vela Web',
    deviceIdPrefix: 'jellyfin-web',
    deviceName: 'Web Browser',
  };
}

export function usePlatform() {
  return {
    isAndroid,
    isDesktop,
    isNative: isAndroid,
    isWeb: !isAndroid && !isDesktop,
    platform: getClientPlatform(),
  };
}
