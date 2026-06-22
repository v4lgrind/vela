import { Capacitor } from '@capacitor/core';

const _isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const _isWeb = !Capacitor.isNativePlatform();

export function usePlatform() {
  return {
    isAndroid: _isAndroid,
    isWeb: _isWeb,
    isNative: Capacitor.isNativePlatform(),
  };
}
