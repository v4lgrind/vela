import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { RepeatMode } from '@/store/audio-player-store';
import type { SleepMode } from '@/utils/sleepTimer';
import type { AutoLibraryConfig } from '@/utils/autoLibraryConfig';

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
  /** Pause after `minutes`, at the end of the track or of the album, with a 10 s fade; 'off' cancels. */
  setSleepTimer(opts: { mode: SleepMode | 'off'; minutes?: number }): Promise<void>;
  /** Loudness leveling on/off; MusicService remembers it (car-started playback too). */
  setLoudnessLeveling(opts: { enabled: boolean }): Promise<void>;
  getState(): Promise<NativeAudioState & { tracks: Record<string, unknown>[] }>;
  /** Server and credentials for browsing the library from Android Auto. */
  /** Android Auto library credentials (see utils/autoLibraryConfig). */
  setLibraryConfig(opts: AutoLibraryConfig): Promise<void>;
  addListener(event: 'stateChange', handler: (e: NativeAudioState) => void): Promise<PluginListenerHandle>;
  addListener(event: 'error', handler: (e: { message: string; code?: string }) => void): Promise<PluginListenerHandle>;
  /** A queue was started from outside the app (Android Auto); read it with getState(). */
  addListener(event: 'externalQueue', handler: () => void): Promise<PluginListenerHandle>;
  /** MusicService paused on the sleep timer. */
  addListener(event: 'sleepTimerFired', handler: () => void): Promise<PluginListenerHandle>;
}

export const NativeAudio = registerPlugin<NativeAudioPluginInterface>('NativeAudio');
