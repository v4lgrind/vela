import type { AudioTrack, RepeatMode } from '@/store/audio-player-store';
import type { SleepTimerRequest } from '@/utils/sleepTimer';

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
  /** Track left on the last item transition and its position then (native engine). */
  previousTrackId?: string;
  previousPosition?: number;
}

/** A playback engine owning the queue: native ExoPlayer service or web <audio>. */
export interface AudioEngine {
  setQueue(items: QueueItem[], startIndex: number, opts?: { position?: number; autoplay?: boolean }): Promise<void>;
  insert(index: number, items: QueueItem[]): Promise<void>;
  remove(index: number): void;
  move(from: number, to: number): void;
  /** Swap every track except the current one, which keeps playing. */
  replaceAroundCurrent(before: QueueItem[], after: QueueItem[]): Promise<void>;
  setRepeatMode(mode: RepeatMode): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  skipTo(index: number): void;
  next(): void;
  previous(): void;
  setVolume(volume: number): void;
  stop(): void;
  /** Engines that can't pause on their own (Cast, web) ignore it: audioPlayerService keeps the timer. */
  setSleepTimer(request: SleepTimerRequest | null): void;
  /** True when the engine pauses itself (native: works with the screen off). */
  readonly ownsSleepTimer: boolean;
  onState(handler: (s: EngineState) => void): void;
  /** `network`: the server could not be reached (offline), as opposed to a bad file. */
  onError(handler: (message: string, network?: boolean) => void): void;
  /** Queue already playing in the engine, if it outlived the WebView. */
  restore(): Promise<{ tracks: AudioTrack[]; state: EngineState } | null>;
}
