import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { NativeAudioPluginInterface, NativeAudioState, NativeAudioTrack } from './NativeAudioPlugin';
import type { RepeatMode } from '@/store/audio-player-store';

type QueueCommands = Omit<NativeAudioPluginInterface, 'setQueue' | 'getState' | 'addListener'>;

/** Music casting to Google Cast devices; same commands and events as NativeAudio. */
export interface CastAudioPluginInterface extends QueueCommands {
  setQueue(opts: {
    tracks: NativeAudioTrack[];
    startIndex: number;
    startPositionMs?: number;
    playWhenReady?: boolean;
    repeatMode?: RepeatMode;
  }): Promise<void>;
  /** Device picker, or the connected device's controls when casting. */
  showDialog(): Promise<void>;
  getAvailability(): Promise<{ available: boolean; deviceName?: string }>;
  endSession(): Promise<void>;
  addListener(event: 'stateChange', handler: (e: NativeAudioState) => void): Promise<PluginListenerHandle>;
  addListener(event: 'availabilityChange', handler: (e: { available: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'sessionStarted', handler: (e: { deviceName: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'sessionEnded', handler: () => void): Promise<PluginListenerHandle>;
}

export const CastAudio = registerPlugin<CastAudioPluginInterface>('CastAudio');
