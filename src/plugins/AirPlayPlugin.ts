import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface AirPlayDevice {
  id: string;
  name: string;
  model: string;
  /** Apple TVs need a one-time PIN pairing */
  needsPin: boolean;
  paired: boolean;
}

export type AirPlayState = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Music output to AirPlay receivers (Apple TV, AirPlay speakers). Android only. */
export interface AirPlayPluginInterface {
  isSupported(): Promise<{ supported: boolean }>;
  getState(): Promise<{ connected: boolean; deviceName?: string }>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(opts: { id: string; volume: number }): Promise<{ needsPairing: boolean }>;
  disconnect(): Promise<void>;
  setVolume(opts: { volume: number }): Promise<void>;
  startPairing(opts: { id: string }): Promise<{ pinRequested: boolean }>;
  submitPin(opts: { pin: string }): Promise<void>;
  cancelPairing(): Promise<void>;
  addListener(event: 'devicesChanged', handler: (e: { devices: AirPlayDevice[] }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'stateChange', handler: (e: { state: AirPlayState; deviceName?: string; error?: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'pairingDone', handler: (e: { ok: boolean; error?: string }) => void): Promise<PluginListenerHandle>;
}

export const AirPlay = registerPlugin<AirPlayPluginInterface>('AirPlay');
