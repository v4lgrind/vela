import { defineStore } from 'pinia';
import { indexAfterMove, moveItem, shuffleAround } from '@/utils/audioQueue';

export type RepeatMode = 'off' | 'all' | 'one';
const NEXT_REPEAT_MODE: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

export interface AudioTrack {
  id: string;
  name: string;
  artist: string;
  albumId: string;
  albumName: string;
  duration: number;
  indexNumber: number;
  /** Album cover (domain image ref); absent on queues saved before it existed. */
  artwork?: string;
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
  insert(index: number, tracks: AudioTrack[]): void;
  remove(index: number): void;
  move(from: number, to: number): void;
  replaceAroundCurrent(before: AudioTrack[], after: AudioTrack[]): void;
  setRepeatMode(mode: RepeatMode): void;
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
  repeatMode: RepeatMode;
  shuffle: boolean;
  /** Queue order to return to when shuffle is turned off */
  unshuffledQueue: AudioTrack[];
  /** Music library whose random picks are playing, topped up as they run out */
  libraryShuffle: string | null;
  /** Last known position, persisted so the queue resumes after a restart */
  resumePosition: number;
  /** A Google Cast device is reachable */
  castAvailable: boolean;
  /** Name of the device the queue is cast to, null when playing locally */
  castDevice: string | null;
  /** The AirPlay sender ships with this build (Android arm64) */
  airplaySupported: boolean;
  /** AirPlay receiver the sound goes to, null when playing on the device */
  airplayDevice: string | null;
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
    repeatMode: 'off',
    shuffle: false,
    unshuffledQueue: [],
    libraryShuffle: null,
    resumePosition: 0,
    castAvailable: false,
    castDevice: null,
    airplaySupported: false,
    airplayDevice: null,
  }),
  persist: {
    pick: ['queue', 'currentIndex', 'volume', 'repeatMode', 'shuffle', 'unshuffledQueue', 'libraryShuffle', 'resumePosition'],
  },
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
      this.unshuffledQueue = tracks;
      this.libraryShuffle = null;
      this.queue = this.shuffle ? shuffleAround(tracks, startIndex) : tracks;
      this.currentIndex = this.shuffle ? 0 : startIndex;
      this.currentTime = 0;
      this.duration = tracks[startIndex]?.duration ?? 0;
      this.isMiniPlayerVisible = true;
      this.isPlaying = true;
      controller?.setQueue(this.queue, this.currentIndex);
    },
    playShuffled(tracks: AudioTrack[]) {
      this.shuffle = true;
      this.playAlbum(tracks, Math.floor(Math.random() * tracks.length));
    },
    /** `tracks` are already random picks from the library (see audioPlayerService refill). */
    playLibraryShuffle(libraryId: string, tracks: AudioTrack[]) {
      this.playAlbum(tracks, 0);
      this.libraryShuffle = libraryId;
    },
    toggleShuffle() {
      const current = this.currentTrack;
      this.shuffle = !this.shuffle;
      if (!current) return;
      let reordered: AudioTrack[];
      if (this.shuffle) {
        this.unshuffledQueue = this.queue.slice();
        reordered = shuffleAround(this.queue, this.currentIndex);
      } else {
        reordered = this.unshuffledQueue.length ? this.unshuffledQueue : this.queue;
      }
      const at = reordered.findIndex((t) => t.id === current.id);
      const before = at >= 0 ? reordered.slice(0, at) : [];
      const after = at >= 0 ? reordered.slice(at + 1) : reordered.filter((t) => t.id !== current.id);
      this.queue = [...before, current, ...after];
      this.currentIndex = before.length;
      controller?.replaceAroundCurrent(before, after);
    },
    cycleRepeat() {
      this.repeatMode = NEXT_REPEAT_MODE[this.repeatMode];
      controller?.setRepeatMode(this.repeatMode);
    },
    playNext(tracks: AudioTrack[]) {
      if (!this.currentTrack) {
        this.playAlbum(tracks);
        return;
      }
      const at = this.currentIndex + 1;
      this.queue = [...this.queue.slice(0, at), ...tracks, ...this.queue.slice(at)];
      this.unshuffledQueue = [...this.unshuffledQueue, ...tracks];
      controller?.insert(at, tracks);
    },
    addToQueue(tracks: AudioTrack[]) {
      if (!this.currentTrack) {
        this.playAlbum(tracks);
        return;
      }
      const at = this.queue.length;
      this.queue = [...this.queue, ...tracks];
      this.unshuffledQueue = [...this.unshuffledQueue, ...tracks];
      controller?.insert(at, tracks);
    },
    /** Removes an upcoming or past track; the playing one can't be removed. */
    removeFromQueue(index: number) {
      if (index === this.currentIndex || !this.queue[index]) return;
      const removedId = this.queue[index].id;
      this.queue = this.queue.filter((_, i) => i !== index);
      if (index < this.currentIndex) this.currentIndex--;
      const u = this.unshuffledQueue.findIndex((t) => t.id === removedId);
      if (u >= 0) this.unshuffledQueue = this.unshuffledQueue.filter((_, i) => i !== u);
      controller?.remove(index);
    },
    moveInQueue(from: number, to: number) {
      if (from === to) return;
      this.queue = moveItem(this.queue, from, to);
      this.currentIndex = indexAfterMove(this.currentIndex, from, to);
      controller?.move(from, to);
    },
    next() {
      if (!this.hasNext) {
        if (this.repeatMode === 'all' && this.queue.length) this.jumpTo(0);
        else this.stop();
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
      this.unshuffledQueue = [];
      this.libraryShuffle = null;
      this.currentIndex = -1;
      this.resumePosition = 0;
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
