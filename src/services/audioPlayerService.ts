import { i18n } from '@/i18n';
import { Capacitor } from '@capacitor/core';
import { watch } from 'vue';
import {
  registerAudioController,
  useAudioPlayerStore,
  type AudioController,
  type AudioTrack,
  type RepeatMode,
} from '../store/audio-player-store';
import { useSessionStore } from '../store/session-store';
import { useOfflineStore } from '../store/offline-store';
import { usePreferencesStore } from '../store/preferences-store';
import { downloadService } from './downloadService';
import { offlineDatabase } from './offlineDatabase';
import { NativeAudioEngine } from './audio/nativeAudioEngine';
import { CastAudioEngine } from './audio/castAudioEngine';
import { CastAudio } from '@/plugins/CastAudioPlugin';
import { NativeAudio } from '@/plugins/NativeAudioPlugin';
import { AirPlay } from '@/plugins/AirPlayPlugin';
import { useToast } from '@/composables/useToast';
import { WebAudioEngine } from './audio/webAudioEngine';
import type { AudioEngine, EngineState, QueueItem } from './audio/types';
import { logger } from '@/utils/logger';
import type { MediaBackend, PlaybackReporter } from '@/domain';
import { trackToAudioTrack } from '@/utils/audioTrack';
import { freshTracks, LIBRARY_SHUFFLE_REFILL_AT } from '@/utils/audioQueue';

const isNative = Capacitor.isNativePlatform();
const REPORT_INTERVAL_MS = 10_000;
const DEFAULT_MUSIC_BITRATE = 140_000_000;
const LIBRARY_SHUFFLE_BATCH = 300;
const ARTWORK_SIZE = { width: 512, height: 512 };
/** Containers (and container|codec pairs) each output plays without a transcode. */
const DEVICE_CONTAINERS = ['opus', 'webm|opus', 'mp3', 'aac', 'm4a|aac', 'm4a|alac', 'm4b|aac', 'flac', 'webma', 'webm|webma', 'wav', 'ogg'];
const CAST_CONTAINERS = ['opus', 'webm|opus', 'mp3', 'aac', 'm4a|aac', 'm4b|aac', 'flac', 'webma', 'webm|webma', 'wav', 'ogg'];

/**
 * Bridges the audio store and the playback engine: resolves stream / local
 * URLs, mirrors engine state into the store and reports playback to the server.
 */
class AudioPlayerService implements AudioController {
  private engine!: AudioEngine;
  /** Engine for the device itself (native, or <audio> on the web preview) */
  private localEngine!: AudioEngine;
  private castEngine: CastAudioEngine | null = null;
  private audioStore!: ReturnType<typeof useAudioPlayerStore>;
  private session!: ReturnType<typeof useSessionStore>;
  private offlineStore!: ReturnType<typeof useOfflineStore>;
  private preferencesStore!: ReturnType<typeof usePreferencesStore>;
  private initialized = false;
  private reporter: PlaybackReporter | null = null;
  private reportedTrackId = '';
  private reportedToServer = false;
  private lastPosition = 0;
  private lastDuration = 0;
  private reportInterval: ReturnType<typeof setInterval> | null = null;
  private ops: Promise<unknown> = Promise.resolve();
  private refilling = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.audioStore = useAudioPlayerStore();
    this.session = useSessionStore();
    this.offlineStore = useOfflineStore();
    this.preferencesStore = usePreferencesStore();

    this.localEngine = isNative ? new NativeAudioEngine() : new WebAudioEngine();
    this.engine = this.localEngine;
    this.bindEngine(this.localEngine);
    if (isNative) {
      this.setupCasting();
      this.setupAirPlay();
      this.setupAndroidAuto();
    }
    registerAudioController(this);
    this.restoreFromEngine();
    void this.backfillArtwork();
    this.setupLibraryShuffleRefill();
  }

  /** Queues saved before tracks carried their cover get it from the server once. */
  private async backfillArtwork() {
    const store = this.audioStore;
    const missing = [...new Set([...store.queue, ...store.unshuffledQueue].filter((t) => !t.artwork).map((t) => t.id))];
    const backend = this.backend();
    if (!missing.length || !backend || !this.offlineStore.isFullyOnline) return;
    try {
      const art = new Map((await backend.catalog.items(missing)).map((item) => [item.id, item.images.poster]));
      const withArt = (track: AudioTrack) => (track.artwork ? track : { ...track, artwork: art.get(track.id) });
      store.queue = store.queue.map(withArt);
      store.unshuffledQueue = store.unshuffledQueue.map(withArt);
    } catch (e) {
      logger.warn('[AudioPlayer] Could not fetch queue artwork', e);
    }
  }

  // --- Library shuffle: more random picks before the queue runs out ---

  private setupLibraryShuffleRefill() {
    watch(
      () => [this.audioStore.libraryShuffle, this.audioStore.currentIndex, this.audioStore.queue.length] as const,
      ([libraryShuffle, index, length]) => {
        if (libraryShuffle && index >= 0 && length - 1 - index <= LIBRARY_SHUFFLE_REFILL_AT) {
          this.refillLibraryShuffle(libraryShuffle);
        }
      },
    );
  }

  private async refillLibraryShuffle(libraryId: string) {
    if (this.refilling) return;
    this.refilling = true;
    try {
      const random = await this.backend()?.music.randomTracks(libraryId, LIBRARY_SHUFFLE_BATCH) ?? [];
      const picks = random.map((track) => trackToAudioTrack(track));
      // The user may have started something else meanwhile.
      if (this.audioStore.libraryShuffle === libraryId) this.audioStore.addToQueue(freshTracks(this.audioStore.queue, picks));
    } catch (e) {
      logger.error('[AudioPlayer] Library shuffle refill failed', e);
    } finally {
      this.refilling = false;
    }
  }

  /** Only the active engine's events reach the store. */
  private bindEngine(engine: AudioEngine) {
    engine.onState((s) => { if (this.engine === engine) this.onEngineState(s); });
    engine.onError((message, network) => { if (this.engine === engine) this.onEngineError(message, network); });
  }

  // --- Casting: while a Cast session is up, the queue plays on the device ---

  openCastDialog() {
    CastAudio.showDialog().catch((e) => logger.error('[AudioPlayer] Cast dialog failed', e));
  }

  private setupCasting() {
    const castEngine = new CastAudioEngine();
    this.castEngine = castEngine;
    this.bindEngine(castEngine);
    CastAudio.getAvailability()
      .then(({ available }) => { this.audioStore.castAvailable = available; })
      .catch(() => {});
    CastAudio.addListener('availabilityChange', ({ available }) => { this.audioStore.castAvailable = available; });
    CastAudio.addListener('sessionStarted', ({ deviceName }) => this.startCasting(castEngine, deviceName));
    CastAudio.addListener('sessionEnded', () => this.stopCasting());
  }

  private startCasting(castEngine: CastAudioEngine, deviceName: string) {
    const store = this.audioStore;
    store.castDevice = deviceName || 'Cast device';
    this.enqueue(async () => {
      this.localEngine.pause();
      this.engine = castEngine;
      castEngine.setRepeatMode(store.repeatMode);
      if (!store.currentTrack) return;
      await this.loadQueue(store.queue, store.currentIndex, { position: store.currentTime, autoplay: store.isPlaying });
    });
  }

  // --- Android Auto: the car browses the library natively and may start a queue ---

  private setupAndroidAuto() {
    // The car can start the music service without the app: it needs its own credentials.
    // The native Android Auto library speaks Jellyfin only (other servers: Phase 9),
    // so it gets credentials only for a Jellyfin account and is disabled otherwise.
    watch(
      () => {
        const active = this.session.backend?.capabilities.androidAuto && this.session.active?.kind === 'jellyfin'
          ? this.session.active : null;
        return [active?.baseUrl, active ? this.session.token : null, active?.user.id, this.preferencesStore.musicMaxBitrate] as const;
      },
      ([serverUrl, accessToken, userId, maxBitrate]) => {
        NativeAudio.setLibraryConfig({
          serverUrl: serverUrl || '',
          accessToken: accessToken || '',
          userId: userId || '',
          maxBitrate: maxBitrate || 140_000_000,
        }).catch((e) => logger.error('[AudioPlayer] setLibraryConfig failed', e));
      },
      { immediate: true },
    );
    NativeAudio.addListener('externalQueue', () => {
      if (this.engine !== this.localEngine) return;
      this.audioStore.shuffle = false;
      // The car's library shuffle is topped up by MusicService itself.
      this.audioStore.libraryShuffle = null;
      this.restoreFromEngine().then(() => {
        this.audioStore.unshuffledQueue = this.audioStore.queue;
      });
    });
  }

  // --- AirPlay: the native player keeps playing, its output goes to the receiver ---

  private setupAirPlay() {
    const store = this.audioStore;
    AirPlay.isSupported()
      .then(({ supported }) => { store.airplaySupported = supported; })
      .catch(() => {});
    AirPlay.getState()
      .then(({ connected, deviceName }) => { store.airplayDevice = connected ? deviceName ?? 'AirPlay' : null; })
      .catch(() => {});
    AirPlay.addListener('stateChange', ({ state, deviceName, error }) => {
      store.airplayDevice = state === 'connecting' || state === 'connected' ? deviceName ?? 'AirPlay' : null;
      if (state === 'error') {
        logger.error('[AudioPlayer] AirPlay error:', error);
        useToast().showError(`AirPlay: ${error ?? i18n.global.t('airplay.connectionLost')}`);
      }
    });
  }

  /** Back on the device, paused where the cast left off. */
  private stopCasting() {
    const store = this.audioStore;
    store.castDevice = null;
    this.enqueue(async () => {
      this.engine = this.localEngine;
      store.isPlaying = false;
      if (!store.currentTrack) return;
      await this.loadQueue(store.queue, store.currentIndex, { position: store.currentTime, autoplay: false });
    });
  }

  // --- AudioController (store intents) ---
  // Engine calls run one after another: inserts resolve URLs asynchronously
  // and must land before a following move/remove addresses their indexes.

  setQueue(tracks: AudioTrack[], startIndex: number) {
    this.enqueue(() => this.loadQueue(tracks, startIndex, { autoplay: true }));
  }

  insert(index: number, tracks: AudioTrack[]) {
    this.enqueue(async () => this.engine.insert(index, await this.toQueueItems(tracks)));
  }

  replaceAroundCurrent(before: AudioTrack[], after: AudioTrack[]) {
    this.enqueue(async () => {
      const [b, a] = await Promise.all([this.toQueueItems(before), this.toQueueItems(after)]);
      await this.engine.replaceAroundCurrent(b, a);
    });
  }

  remove(index: number) { this.enqueue(() => this.engine.remove(index)); }
  move(from: number, to: number) { this.enqueue(() => this.engine.move(from, to)); }
  setRepeatMode(mode: RepeatMode) { this.enqueue(() => this.engine.setRepeatMode(mode)); }
  play() { this.enqueue(() => this.engine.play()); }
  pause() { this.enqueue(() => this.engine.pause()); }
  seek(seconds: number) { this.enqueue(() => this.engine.seek(seconds)); }
  skipTo(index: number) { this.enqueue(() => this.engine.skipTo(index)); }
  next() { this.enqueue(() => this.engine.next()); }
  previous() { this.enqueue(() => this.engine.previous()); }
  setVolume(volume: number) { this.enqueue(() => this.engine.setVolume(volume)); }

  stop() {
    this.enqueue(() => this.engine.stop());
    this.endReporting();
  }

  private enqueue(op: () => unknown) {
    this.ops = this.ops
      .then(op)
      .catch((e) => logger.error('[AudioPlayer] Engine command failed', e));
  }

  // --- Engine → store ---

  private onEngineState(s: EngineState) {
    // Ignore events from a queue the store has already replaced.
    if (this.audioStore.queue[s.index]?.id !== s.trackId) return;
    if (s.ended) {
      this.audioStore.stop();
      return;
    }
    this.audioStore.applySnapshot({
      index: s.index,
      isPlaying: s.isPlaying,
      currentTime: s.position,
      duration: s.duration,
    });
    if (s.trackId !== this.reportedTrackId) this.onTrackChanged(s.trackId);
    this.lastPosition = s.position;
    this.audioStore.resumePosition = s.position;
    this.lastDuration = s.duration;
  }

  private onEngineError(message: string, network = false) {
    logger.error('[AudioPlayer] Playback error:', message);
    if (!network) {
      if (this.audioStore.hasNext) this.audioStore.next();
      return;
    }
    // Offline, every streamed track would fail in turn: only a downloaded one can play.
    const { queue, currentIndex } = this.audioStore;
    const nextLocal = queue.findIndex((track, i) => i > currentIndex && this.offlineStore.isItemDownloaded(track.id));
    if (nextLocal >= 0) {
      this.audioStore.jumpTo(nextLocal);
      return;
    }
    if (this.audioStore.isPlaying) this.audioStore.togglePlayPause();
    useToast().showError(i18n.global.t('audio.offlineNoNext'));
  }

  /**
   * Resync with a queue the native service kept playing while the WebView was
   * gone; otherwise reload the persisted queue, paused where it was left.
   */
  private async restoreFromEngine() {
    try {
      const restored = await this.engine.restore();
      if (!restored) {
        this.resumePersistedQueue();
        return;
      }
      const { tracks, state } = restored;
      this.audioStore.restoreQueue(tracks, {
        index: state.index,
        isPlaying: state.isPlaying,
        currentTime: state.position,
        duration: state.duration,
      });
    } catch (e) {
      logger.error('[AudioPlayer] Restore failed', e);
    }
  }

  private resumePersistedQueue() {
    const store = this.audioStore;
    if (!store.currentTrack) return;
    store.isMiniPlayerVisible = true;
    store.isPlaying = false;
    store.currentTime = store.resumePosition;
    store.duration = store.currentTrack.duration;
    this.enqueue(async () => {
      await this.loadQueue(store.queue, store.currentIndex, { position: store.resumePosition, autoplay: false });
      this.engine.setVolume(store.volume / 100);
      this.engine.setRepeatMode(store.repeatMode);
    });
  }

  // --- URLs ---

  private async loadQueue(tracks: AudioTrack[], startIndex: number, opts: { position?: number; autoplay: boolean }) {
    await this.engine.setQueue(await this.toQueueItems(tracks), startIndex, opts);
  }

  private toQueueItems(tracks: AudioTrack[]): Promise<QueueItem[]> {
    return Promise.all(tracks.map((t) => this.toQueueItem(t)));
  }

  private async toQueueItem(track: AudioTrack): Promise<QueueItem> {
    return {
      track,
      url: await this.resolveUrl(track.id),
      artworkUrl: track.artwork ? this.backend()?.imageUrl(track.artwork, ARTWORK_SIZE) ?? '' : '',
    };
  }

  private async resolveUrl(itemId: string): Promise<string> {
    // A Cast device fetches from the server itself; local files are out of reach.
    if (this.offlineStore.isItemDownloaded(itemId) && this.engine !== this.castEngine) {
      const local = isNative
        ? await downloadService.getNativeFileUri(itemId)
        : await downloadService.getLocalFile(itemId);
      if (local) return local;
      logger.error('[AudioPlayer] Fichier local introuvable', itemId);
    }
    return this.buildStreamUrl(itemId);
  }

  private backend(): MediaBackend | null {
    return this.session.backend;
  }

  private buildStreamUrl(itemId: string): string {
    const backend = this.backend();
    if (!backend) return '';
    return backend.music.streamUrl(itemId, {
      maxBitrate: this.preferencesStore.musicMaxBitrate || DEFAULT_MUSIC_BITRATE,
      // Cast devices can't decode ALAC, so it gets transcoded for them.
      directContainers: this.engine === this.castEngine ? CAST_CONTAINERS : DEVICE_CONTAINERS,
      // ExoPlayer picks the extractor from the URL, so it can't follow a
      // redirect to an HLS playlist; ask for a progressive transcode instead.
      transcode: isNative
        ? { container: 'mp3', codec: 'mp3', protocol: 'http' }
        : { container: 'ts', codec: 'aac', protocol: 'hls' },
    });
  }

  // --- Playback reporting ---

  private onTrackChanged(trackId: string) {
    this.endReporting();
    this.reportedTrackId = trackId;
    this.reportedToServer = !this.offlineStore.isItemDownloaded(trackId);
    if (this.reportedToServer) this.reportPlaybackStart(trackId);
    this.reportInterval = setInterval(() => this.reportProgress(), REPORT_INTERVAL_MS);
  }

  private endReporting() {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
    if (this.reportedTrackId && this.reportedToServer) {
      this.reportPlaybackStopped(this.reportedTrackId, this.lastPosition);
    }
    this.reportedTrackId = '';
  }

  private reportProgress() {
    if (this.reportedToServer) this.reportPlaybackProgress();
    else this.saveOfflineProgress();
  }

  private async saveOfflineProgress() {
    if (!this.lastDuration) return;
    const ratio = this.lastPosition / this.lastDuration;
    await offlineDatabase.saveWatchProgress({
      itemId: this.reportedTrackId,
      position: this.lastPosition,
      duration: this.lastDuration,
      percentage: ratio * 100,
      completed: ratio > 0.9,
      lastWatched: Date.now(),
      synced: false,
    });
  }

  private progress(positionSeconds: number) {
    return {
      positionMs: Math.floor(positionSeconds * 1000),
      isPaused: !this.audioStore.isPlaying,
      isMuted: this.audioStore.volume === 0,
      volume: Math.round(this.audioStore.volume * 100),
    };
  }

  private report(what: string, call: (reporter: PlaybackReporter) => Promise<void>) {
    if (!this.reporter) return;
    call(this.reporter).catch((e) => logger.error(`[AudioPlayer] report ${what} error`, e));
  }

  private reportPlaybackStart(itemId: string) {
    this.reporter = this.backend()?.music.reporter(itemId) ?? null;
    this.report('start', (r) => r.start(this.progress(0)));
  }

  private reportPlaybackProgress() {
    this.report('progress', (r) => r.progress(this.progress(this.lastPosition)));
  }

  private reportPlaybackStopped(_itemId: string, positionSeconds: number) {
    this.report('stopped', (r) => r.stop(this.progress(positionSeconds)));
  }
}

export const audioPlayerService = new AudioPlayerService();
