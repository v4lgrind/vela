import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { RepeatMode } from '@/store/audio-player-store';

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
  addTracks(opts: { index: number; tracks: NativeAudioTrack[] }): Promise<void>;
  removeTrack(opts: { index: number }): Promise<void>;
  moveTrack(opts: { from: number; to: number }): Promise<void>;
  replaceAroundCurrent(opts: { before: NativeAudioTrack[]; after: NativeAudioTrack[] }): Promise<void>;
  setRepeatMode(opts: { mode: RepeatMode }): Promise<void>;
  getState(): Promise<NativeAudioState & { tracks: Record<string, unknown>[] }>;
  /** Server and credentials for browsing the library from Android Auto. */
  setLibraryConfig(opts: { serverUrl: string; accessToken: string; userId: string; maxBitrate: number }): Promise<void>;
  addListener(event: 'stateChange', handler: (e: NativeAudioState) => void): Promise<PluginListenerHandle>;
  addListener(event: 'error', handler: (e: { message: string; code?: string }) => void): Promise<PluginListenerHandle>;
  /** A queue was started from outside the app (Android Auto); read it with getState(). */
  addListener(event: 'externalQueue', handler: () => void): Promise<PluginListenerHandle>;
}

export const NativeAudio = registerPlugin<NativeAudioPluginInterface>('NativeAudio');
