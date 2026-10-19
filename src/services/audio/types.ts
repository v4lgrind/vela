import type { AudioTrack } from '@/store/audio-player-store';

export interface QueueItem {
  track: AudioTrack;
  url: string;
  artworkUrl: string;
}

export interface EngineState {
  index: number;
  trackId: string;
  isPlaying: boolean;
  /** The last track finished and nothing follows */
  ended: boolean;
  position: number;
  duration: number;
}

/** A playback engine owning the queue: native ExoPlayer service or web <audio>. */
export interface AudioEngine {
  setQueue(items: QueueItem[], startIndex: number): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  skipTo(index: number): void;
  next(): void;
  previous(): void;
  setVolume(volume: number): void;
  stop(): void;
  onState(handler: (s: EngineState) => void): void;
  onError(handler: (message: string) => void): void;
  /** Queue already playing in the engine, if it outlived the WebView. */
  restore(): Promise<{ tracks: AudioTrack[]; state: EngineState } | null>;
}
