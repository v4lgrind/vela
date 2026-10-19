import { Capacitor } from '@capacitor/core';
import {
  registerAudioController,
  useAudioPlayerStore,
  type AudioController,
  type AudioTrack,
  type RepeatMode,
} from '../store/audio-player-store';
import { useJellyfinStore } from '../store/jellyfin-store';
import { useOfflineStore } from '../store/offline-store';
import { downloadService } from './downloadService';
import { offlineDatabase } from './offlineDatabase';
import { NativeAudioEngine } from './audio/nativeAudioEngine';
import { WebAudioEngine } from './audio/webAudioEngine';
import type { AudioEngine, EngineState, QueueItem } from './audio/types';
import { logger } from '@/utils/logger';
import { jellyfinAuthorization } from '@/utils/jellyfinAuthorization';

const isNative = Capacitor.isNativePlatform();
const REPORT_INTERVAL_MS = 10_000;

/**
 * Bridges the audio store and the playback engine: resolves stream / local
 * URLs, mirrors engine state into the store and reports playback to Jellyfin.
 */
class AudioPlayerService implements AudioController {
  private engine!: AudioEngine;
  private audioStore!: ReturnType<typeof useAudioPlayerStore>;
  private jellyfinStore!: ReturnType<typeof useJellyfinStore>;
  private offlineStore!: ReturnType<typeof useOfflineStore>;
  private initialized = false;
  private playSessionId = '';
  private reportedTrackId = '';
  private reportedToServer = false;
  private lastPosition = 0;
  private lastDuration = 0;
  private reportInterval: ReturnType<typeof setInterval> | null = null;
  private ops: Promise<unknown> = Promise.resolve();

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.audioStore = useAudioPlayerStore();
    this.jellyfinStore = useJellyfinStore();
    this.offlineStore = useOfflineStore();

    this.engine = isNative ? new NativeAudioEngine() : new WebAudioEngine();
    this.engine.onState((s) => this.onEngineState(s));
    this.engine.onError((message) => this.onEngineError(message));
    registerAudioController(this);
    this.restoreFromEngine();
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

  private onEngineError(message: string) {
    logger.error('[AudioPlayer] Playback error:', message);
    if (this.audioStore.hasNext) this.audioStore.next();
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
      artworkUrl: this.jellyfinStore.getImageUrl(track.albumId || track.id, 'Primary', 512, 512),
    };
  }

  private async resolveUrl(itemId: string): Promise<string> {
    if (this.offlineStore.isItemDownloaded(itemId)) {
      const local = isNative
        ? await downloadService.getNativeFileUri(itemId)
        : await downloadService.getLocalFile(itemId);
      if (local) return local;
      logger.error('[AudioPlayer] Fichier local introuvable', itemId);
    }
    return this.buildStreamUrl(itemId);
  }

  private buildStreamUrl(itemId: string): string {
    const params = new URLSearchParams({
      userId: this.jellyfinStore.userId || '',
      ApiKey: this.jellyfinStore.accessToken || '',
      MaxStreamingBitrate: '140000000',
      Container: 'opus,webm|opus,mp3,aac,m4a|aac,m4a|alac,m4b|aac,flac,webma,webm|webma,wav,ogg',
      // ExoPlayer picks the extractor from the URL, so it can't follow a
      // redirect to an HLS playlist; ask for a progressive transcode instead.
      TranscodingContainer: isNative ? 'mp3' : 'ts',
      TranscodingProtocol: isNative ? 'http' : 'hls',
      AudioCodec: isNative ? 'mp3' : 'aac',
    });
    return `${this.jellyfinStore.serverUrl}/Audio/${itemId}/universal?${params.toString()}`;
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

  private get reportingHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: jellyfinAuthorization(this.jellyfinStore.accessToken || ''),
    };
  }

  private buildReportingPayload(itemId: string, positionSeconds: number) {
    return {
      ItemId: itemId,
      SessionId: this.playSessionId,
      MediaSourceId: itemId,
      PositionTicks: Math.floor(positionSeconds * 10_000_000),
      PlayMethod: 'DirectStream',
      PlaySessionId: this.playSessionId,
      IsMuted: this.audioStore.volume === 0,
      VolumeLevel: this.audioStore.volume,
      IsPaused: !this.audioStore.isPlaying,
    };
  }

  private async postSession(path: string, body: object) {
    try {
      await fetch(`${this.jellyfinStore.serverUrl}/Sessions/Playing${path}`, {
        method: 'POST',
        headers: this.reportingHeaders,
        body: JSON.stringify(body),
      });
    } catch (e) {
      logger.error(`[AudioPlayer] report ${path || 'start'} error`, e);
    }
  }

  private reportPlaybackStart(itemId: string) {
    this.playSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    this.postSession('', this.buildReportingPayload(itemId, 0));
  }

  private reportPlaybackProgress() {
    this.postSession('/Progress', this.buildReportingPayload(this.reportedTrackId, this.lastPosition));
  }

  private reportPlaybackStopped(itemId: string, positionSeconds: number) {
    this.postSession('/Stopped', this.buildReportingPayload(itemId, positionSeconds));
  }
}

export const audioPlayerService = new AudioPlayerService();
