import type { RepeatMode } from '@/store/audio-player-store';
import type { AudioEngine, EngineState, QueueItem } from './types';

const RESTART_THRESHOLD_S = 3;

/** <audio> element fallback for the dev-server web preview. */
export class WebAudioEngine implements AudioEngine {
  private audio = document.createElement('audio');
  private items: QueueItem[] = [];
  private index = -1;
  private ended = false;
  private repeatMode: RepeatMode = 'off';
  private stateHandler: (s: EngineState) => void = () => {};
  private errorHandler: (message: string) => void = () => {};

  constructor() {
    this.audio.preload = 'metadata';
    for (const event of ['timeupdate', 'loadedmetadata', 'play', 'pause']) {
      this.audio.addEventListener(event, () => this.emit());
    }
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('error', () => this.errorHandler(this.audio.error?.message || 'Audio error'));
    this.setupMediaSession();
  }

  async setQueue(items: QueueItem[], startIndex: number, opts: { position?: number; autoplay?: boolean } = {}) {
    this.items = items;
    this.load(startIndex, opts.autoplay ?? true);
    if (opts.position) this.audio.currentTime = opts.position;
  }

  async insert(index: number, items: QueueItem[]) {
    this.items.splice(index, 0, ...items);
    if (index <= this.index) this.index += items.length;
  }

  remove(index: number) {
    this.items.splice(index, 1);
    if (index < this.index) this.index--;
    else if (index === this.index) this.load(Math.min(index, this.items.length - 1));
  }

  move(from: number, to: number) {
    const [item] = this.items.splice(from, 1);
    this.items.splice(to, 0, item);
    if (from === this.index) this.index = to;
    else if (from < this.index && to >= this.index) this.index--;
    else if (from > this.index && to <= this.index) this.index++;
  }

  async replaceAroundCurrent(before: QueueItem[], after: QueueItem[]) {
    this.items = [...before, this.items[this.index], ...after];
    this.index = before.length;
  }

  setRepeatMode(mode: RepeatMode) { this.repeatMode = mode; }

  play() { this.audio.play().catch(() => {}); }
  pause() { this.audio.pause(); }
  seek(seconds: number) { this.audio.currentTime = seconds; }
  skipTo(index: number) { this.load(index); }

  next() {
    if (this.index < this.items.length - 1) this.load(this.index + 1);
  }

  previous() {
    if (this.audio.currentTime > RESTART_THRESHOLD_S || this.index <= 0) {
      this.audio.currentTime = 0;
    } else {
      this.load(this.index - 1);
    }
  }

  setVolume(volume: number) { this.audio.volume = volume; }

  stop() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.items = [];
    this.index = -1;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    }
  }

  onState(handler: (s: EngineState) => void) { this.stateHandler = handler; }
  onError(handler: (message: string) => void) { this.errorHandler = handler; }
  async restore() { return null; }

  private load(index: number, autoplay = true) {
    const item = this.items[index];
    if (!item) return;
    this.index = index;
    this.ended = false;
    this.audio.src = item.url;
    this.audio.load();
    if (autoplay) this.play();
    this.updateMediaSessionMetadata(item);
    this.emit();
  }

  private onEnded() {
    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.play();
      return;
    }
    if (this.index < this.items.length - 1 || this.repeatMode === 'all') {
      this.load((this.index + 1) % this.items.length);
      return;
    }
    this.ended = true;
    this.emit();
  }

  private emit() {
    const duration = this.audio.duration;
    this.stateHandler({
      index: this.index,
      trackId: this.items[this.index]?.track.id ?? '',
      isPlaying: !this.audio.paused,
      ended: this.ended,
      position: this.audio.currentTime || 0,
      duration: Number.isFinite(duration) ? duration : 0,
    });
    this.updatePositionState();
  }

  // --- Media Session API (browser media controls) ---

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => this.play());
    ms.setActionHandler('pause', () => this.pause());
    ms.setActionHandler('nexttrack', () => this.next());
    ms.setActionHandler('previoustrack', () => this.previous());
    ms.setActionHandler('seekto', (d) => { if (d.seekTime != null) this.seek(d.seekTime); });
  }

  private updateMediaSessionMetadata({ track, artworkUrl }: QueueItem) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artist: track.artist,
      album: track.albumName,
      artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
    });
  }

  private updatePositionState() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = this.audio.paused ? 'paused' : 'playing';
    const duration = this.audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: this.audio.playbackRate,
        position: Math.min(this.audio.currentTime, duration),
      });
    } catch {
      // position state may fail if duration is not ready
    }
  }
}
