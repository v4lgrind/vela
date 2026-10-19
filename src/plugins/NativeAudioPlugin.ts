import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeAudioTrack {
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  /** Opaque JS track data, handed back by getState() */
  track: Record<string, unknown>;
}

export interface NativeAudioState {
  index: number;
  trackId: string;
  isPlaying: boolean;
  ended: boolean;
  positionMs: number;
  durationMs: number;
}

export interface NativeAudioPluginInterface {
  setQueue(opts: {
    tracks: NativeAudioTrack[];
    startIndex: number;
    startPositionMs?: number;
    playWhenReady?: boolean;
  }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(opts: { positionMs: number }): Promise<void>;
  skipTo(opts: { index: number }): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  setVolume(opts: { volume: number }): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<NativeAudioState & { tracks: Record<string, unknown>[] }>;
  addListener(event: 'stateChange', handler: (e: NativeAudioState) => void): Promise<PluginListenerHandle>;
  addListener(event: 'error', handler: (e: { message: string }) => void): Promise<PluginListenerHandle>;
}

export const NativeAudio = registerPlugin<NativeAudioPluginInterface>('NativeAudio');
