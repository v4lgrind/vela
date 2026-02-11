import { watch } from 'vue';
import { useAudioPlayerStore } from '../store/audio-player-store';
import { useJellyfinStore } from '../store/jellyfin-store';
import { useOfflineStore } from '../store/offline-store';
import { downloadService } from './downloadService';
import { offlineDatabase } from './offlineDatabase';

class AudioPlayerService {
  private audio: HTMLAudioElement;
  private audioStore!: ReturnType<typeof useAudioPlayerStore>;
  private jellyfinStore!: ReturnType<typeof useJellyfinStore>;
  private offlineStore!: ReturnType<typeof useOfflineStore>;
  private progressInterval: ReturnType<typeof setInterval> | null = null;
  private playSessionId = '';
  private initialized = false;
  // Track the index we've loaded so we don't re-load the same track
  private loadedIndex = -1;
  private loadedTrackId = '';
  private offlineProgressInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.audio = document.createElement('audio');
    this.audio.preload = 'metadata';
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.audioStore = useAudioPlayerStore();
    this.jellyfinStore = useJellyfinStore();
    this.offlineStore = useOfflineStore();

    this.setupAudioEvents();
    this.setupStoreWatchers();
  }

  private setupAudioEvents() {
    this.audio.addEventListener('timeupdate', () => {
      if (this.audioStore) {
        this.audioStore.currentTime = this.audio.currentTime;
        this.updatePositionState();
      }
    });

    this.audio.addEventListener('loadedmetadata', () => {
      if (this.audioStore) {
        this.audioStore.duration = this.audio.duration;
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.audioStore) {
        this.stopProgressReporting();
        this.audioStore.next();
      }
    });

    this.audio.addEventListener('play', () => {
      if (this.audioStore) {
        this.audioStore.isPlaying = true;
      }
    });

    this.audio.addEventListener('pause', () => {
      if (this.audioStore) {
        this.audioStore.isPlaying = false;
      }
    });
  }

  private setupStoreWatchers() {
    // Watch for track changes (currentIndex or queue changes)
    watch(
      () => ({
        index: this.audioStore.currentIndex,
        trackId: this.audioStore.currentTrack?.id,
      }),
      (newVal) => {
        if (newVal.trackId && (newVal.index !== this.loadedIndex || newVal.trackId !== this.loadedTrackId)) {
          this.loadedIndex = newVal.index;
          this.loadedTrackId = newVal.trackId;
          this.loadTrack(newVal.trackId);
        }
      },
      { immediate: true }
    );

    // Watch play/pause
    watch(
      () => this.audioStore.isPlaying,
      (playing) => {
        if (!this.audioStore.currentTrack) return;
        if (playing && this.audio.paused) {
          this.audio.play().catch(() => {});
        } else if (!playing && !this.audio.paused) {
          this.audio.pause();
        }
        this.updateNativeNotification();
      }
    );

    // Watch volume
    watch(
      () => this.audioStore.volume,
      (vol) => {
        this.audio.volume = vol / 100;
      },
      { immediate: true }
    );

    // Watch seek (when user seeks via store action)
    watch(
      () => this.audioStore.currentTime,
      (time) => {
        // Only seek if difference is more than 1.5s (avoid feedback loop from timeupdate)
        if (Math.abs(this.audio.currentTime - time) > 1.5) {
          this.audio.currentTime = time;
          this.reportPlaybackProgress();
        }
      }
    );

    // Watch for stop (queue cleared)
    watch(
      () => this.audioStore.queue.length,
      (len) => {
        if (len === 0) {
          this.stopPlayback();
        }
      }
    );
  }

  private buildAudioUrl(itemId: string): string {
    const serverUrl = this.jellyfinStore.serverUrl;
    const accessToken = this.jellyfinStore.accessToken || '';

    const params = new URLSearchParams({
      userId: this.jellyfinStore.userId || '',
      api_key: accessToken,
      MaxStreamingBitrate: '140000000',
      Container: 'opus,webm|opus,mp3,aac,m4a|aac,m4b|aac,flac,webma,webm|webma,wav,ogg',
      TranscodingContainer: 'ts',
      TranscodingProtocol: 'hls',
      AudioCodec: 'aac',
    });

    return `${serverUrl}/Audio/${itemId}/universal?${params.toString()}`;
  }

  private async loadTrack(trackId: string) {
    // Stop previous reporting
    this.stopProgressReporting();
    this.stopOfflineProgressTracking();

    // Stop current playback
    this.audio.pause();

    // Check if track is downloaded
    const isDownloaded = this.offlineStore.isItemDownloaded(trackId);

    if (isDownloaded) {
      // Offline playback
      console.log('[AudioPlayer] Lecture hors ligne:', trackId);
      const localUrl = await downloadService.getLocalFile(trackId);

      if (localUrl) {
        this.audio.src = localUrl;
        this.audio.load();

        try {
          await this.audio.play();
          this.startOfflineProgressTracking(trackId);
          this.startNativeService();
        } catch {
          // autoplay may be blocked
        }

        return;
      } else {
        console.error('[AudioPlayer] Fichier local introuvable');
      }
    }

    // Online playback
    const url = this.buildAudioUrl(trackId);
    this.audio.src = url;
    this.audio.load();

    try {
      await this.audio.play();
      this.startProgressReporting(trackId);
      this.startNativeService();
    } catch {
      // autoplay may be blocked
    }
  }

  private startOfflineProgressTracking(trackId: string) {
    if (this.offlineProgressInterval) return;

    this.offlineProgressInterval = setInterval(async () => {
      if (!this.audio.duration || isNaN(this.audio.duration)) return;

      const progress = {
        itemId: trackId,
        position: this.audio.currentTime,
        duration: this.audio.duration,
        percentage: (this.audio.currentTime / this.audio.duration) * 100,
        completed: (this.audio.currentTime / this.audio.duration) > 0.9,
        lastWatched: Date.now(),
        synced: false,
      };

      await offlineDatabase.saveWatchProgress(progress);
    }, 10000); // Save every 10 seconds
  }

  private stopOfflineProgressTracking() {
    if (this.offlineProgressInterval) {
      clearInterval(this.offlineProgressInterval);
      this.offlineProgressInterval = null;
    }
  }

  private stopPlayback() {
    this.stopProgressReporting();
    this.stopOfflineProgressTracking();
    this.audio.pause();
    this.audio.src = '';
    this.loadedIndex = -1;
    this.loadedTrackId = '';
    this.stopNativeService();
  }

  // --- Jellyfin Session Reporting ---

  private get reportingHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Emby-Token': this.jellyfinStore.accessToken || '',
    };
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private buildReportingPayload(itemId: string, overrides: Record<string, any> = {}) {
    return {
      ItemId: itemId,
      SessionId: this.playSessionId,
      MediaSourceId: itemId,
      PositionTicks: Math.floor((this.audio.currentTime || 0) * 10_000_000),
      PlayMethod: 'DirectStream',
      PlaySessionId: this.playSessionId,
      IsMuted: this.audio.muted || false,
      VolumeLevel: Math.floor((this.audio.volume || 1) * 100),
      ...overrides,
    };
  }

  private async reportPlaybackStart(itemId: string) {
    this.playSessionId = this.generateSessionId();
    try {
      await fetch(`${this.jellyfinStore.serverUrl}/Sessions/Playing`, {
        method: 'POST',
        headers: this.reportingHeaders,
        body: JSON.stringify(this.buildReportingPayload(itemId, { IsPaused: false })),
      });
    } catch (e) {
      console.error('reportPlaybackStart error', e);
    }
  }

  private async reportPlaybackProgress() {
    const track = this.audioStore.currentTrack;
    if (!track) return;
    try {
      await fetch(`${this.jellyfinStore.serverUrl}/Sessions/Playing/Progress`, {
        method: 'POST',
        headers: this.reportingHeaders,
        body: JSON.stringify(
          this.buildReportingPayload(track.id, { IsPaused: !this.audioStore.isPlaying })
        ),
      });
    } catch (e) {
      console.error('reportPlaybackProgress error', e);
    }
  }

  private async reportPlaybackStopped(itemId: string) {
    try {
      await fetch(`${this.jellyfinStore.serverUrl}/Sessions/Playing/Stopped`, {
        method: 'POST',
        headers: this.reportingHeaders,
        body: JSON.stringify({
          ItemId: itemId,
          SessionId: this.playSessionId,
          MediaSourceId: itemId,
          PositionTicks: Math.floor((this.audio.currentTime || 0) * 10_000_000),
          PlaySessionId: this.playSessionId,
        }),
      });
    } catch (e) {
      console.error('reportPlaybackStopped error', e);
    }
  }

  private startProgressReporting(itemId: string) {
    this.reportPlaybackStart(itemId);
    this.progressInterval = setInterval(() => {
      this.reportPlaybackProgress();
    }, 10000);
  }

  private stopProgressReporting() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    const track = this.audioStore?.currentTrack;
    if (track) {
      this.reportPlaybackStopped(track.id);
    }
  }

  // --- Media Session API (lock screen / notification controls) ---

  private startNativeService() {
    if (!('mediaSession' in navigator)) return;
    const track = this.audioStore.currentTrack;
    if (!track) return;

    const artUrl = this.jellyfinStore.getImageUrl(track.albumId || track.id, 'Primary', 512, 512);

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artist: track.artist,
      album: track.albumName || '',
      artwork: artUrl ? [
        { src: artUrl, sizes: '512x512', type: 'image/jpeg' },
      ] : [],
    });

    navigator.mediaSession.setActionHandler('play', () => {
      this.audioStore.isPlaying = true;
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      this.audioStore.isPlaying = false;
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      this.audioStore.next();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      this.audioStore.previous();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) {
        this.audio.currentTime = details.seekTime;
        this.audioStore.currentTime = details.seekTime;
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      this.audio.currentTime = Math.max(0, this.audio.currentTime - (details.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      this.audio.currentTime = Math.min(this.audio.duration || 0, this.audio.currentTime + (details.seekOffset || 10));
    });
  }

  private updateNativeNotification() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = this.audioStore.isPlaying ? 'playing' : 'paused';
    this.updatePositionState();
  }

  private updatePositionState() {
    if (!('mediaSession' in navigator)) return;
    if (!this.audio.duration || isNaN(this.audio.duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: this.audio.duration,
        playbackRate: this.audio.playbackRate,
        position: Math.min(this.audio.currentTime, this.audio.duration),
      });
    } catch {
      // ignore - position state may fail if duration is not ready
    }
  }

  private stopNativeService() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  }
}

export const audioPlayerService = new AudioPlayerService();
