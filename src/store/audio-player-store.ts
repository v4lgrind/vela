import { defineStore } from 'pinia';

export interface AudioTrack {
  id: string;
  name: string;
  artist: string;
  albumId: string;
  albumName: string;
  duration: number;
  indexNumber: number;
}

/** What the playback engine reports back; mirrored into the store. */
export interface PlayerSnapshot {
  index: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

/**
 * Executes store intents on the actual playback engine (native ExoPlayer
 * service or the web <audio> fallback). Registered by audioPlayerService.
 */
export interface AudioController {
  setQueue(tracks: AudioTrack[], startIndex: number): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  skipTo(index: number): void;
  next(): void;
  previous(): void;
  setVolume(volume: number): void;
  stop(): void;
}

let controller: AudioController | null = null;

export function registerAudioController(c: AudioController) {
  controller = c;
}

interface AudioPlayerState {
  queue: AudioTrack[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMiniPlayerVisible: boolean;
  isExpanded: boolean;
}

export const useAudioPlayerStore = defineStore('audio-player', {
  state: (): AudioPlayerState => ({
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 100,
    isMiniPlayerVisible: false,
    isExpanded: false,
  }),
  persist: false,
  getters: {
    currentTrack: (state): AudioTrack | null => {
      if (state.currentIndex < 0 || state.currentIndex >= state.queue.length) return null;
      return state.queue[state.currentIndex];
    },
    hasNext: (state): boolean => state.currentIndex < state.queue.length - 1,
    hasPrevious: (state): boolean => state.currentIndex > 0,
    progress: (state): number => {
      if (state.duration <= 0) return 0;
      return (state.currentTime / state.duration) * 100;
    },
  },
  actions: {
    playTrack(track: AudioTrack) {
      this.playAlbum([track], 0);
    },
    playAlbum(tracks: AudioTrack[], startIndex = 0) {
      this.queue = tracks;
      this.currentIndex = startIndex;
      this.currentTime = 0;
      this.duration = tracks[startIndex]?.duration ?? 0;
      this.isMiniPlayerVisible = true;
      this.isPlaying = true;
      controller?.setQueue(tracks, startIndex);
    },
    next() {
      if (!this.hasNext) {
        this.stop();
        return;
      }
      this.currentIndex++;
      this.currentTime = 0;
      this.duration = this.queue[this.currentIndex].duration;
      this.isPlaying = true;
      controller?.next();
    },
    /** Restarts the track past 3 s, otherwise goes to the previous one. */
    previous() {
      controller?.previous();
    },
    jumpTo(index: number) {
      this.currentIndex = index;
      this.currentTime = 0;
      this.duration = this.queue[index]?.duration ?? 0;
      this.isPlaying = true;
      controller?.skipTo(index);
    },
    togglePlayPause() {
      this.isPlaying = !this.isPlaying;
      if (this.isPlaying) controller?.play();
      else controller?.pause();
    },
    seek(seconds: number) {
      this.currentTime = seconds;
      controller?.seek(seconds);
    },
    setVolume(v: number) {
      this.volume = Math.max(0, Math.min(100, v));
      controller?.setVolume(this.volume / 100);
    },
    stop() {
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;
      this.isMiniPlayerVisible = false;
      this.isExpanded = false;
      this.queue = [];
      this.currentIndex = -1;
      controller?.stop();
    },
    /** Mirror the engine's state; never calls back into the controller. */
    applySnapshot(s: PlayerSnapshot) {
      if (s.index >= 0 && s.index < this.queue.length && s.index !== this.currentIndex) {
        this.currentIndex = s.index;
        this.duration = this.queue[s.index].duration;
      }
      this.isPlaying = s.isPlaying;
      this.currentTime = s.currentTime;
      if (s.duration > 0) this.duration = s.duration;
    },
    /** Adopt a queue the engine is already playing (e.g. after a WebView reload). */
    restoreQueue(tracks: AudioTrack[], s: PlayerSnapshot) {
      this.queue = tracks;
      this.isMiniPlayerVisible = true;
      this.applySnapshot(s);
    },
  },
});
