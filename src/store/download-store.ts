import { defineStore } from 'pinia';
import { Capacitor } from '@capacitor/core';

import { getClientPlatform } from '@/composables/usePlatform';
import { useToast } from '@/composables/useToast';
import { QUALITY_PRESETS } from '@/constants';
import { canSoftwareDecode, displayBoundsFor, exceedsDisplay, isAudioCodecSupported, recommendedTranscodeBitrate } from '@/domain';
import type { DeviceCapabilities, DownloadRequest, MediaBackend, MediaItem, MediaVersion } from '@/domain';
import { i18n } from '@/i18n';
import { artworkResolverFor, buildOfflineArtworkTargets, downloadService } from '@/services/downloadService';
import { offlineDatabase, type DownloadedMedia } from '@/services/offlineDatabase';
import { canHardwareDecodeVideo, deviceCapabilities } from '@/utils/codecDetection';
import { needsDesktopTranscode } from '@/utils/desktopCodec';
import { languageMatches } from '@/utils/language';
import { logger } from '@/utils/logger';

import { useMetadataCacheStore } from './metadata-cache-store';
import { useOfflineStore } from './offline-store';
import { usePreferencesStore } from './preferences-store';
import { useSessionStore } from './session-store';

const MAX_CONCURRENT = 3;
const MAX_SOFTWARE_DECODE_HEIGHT = 1080;
const isDesktopPlatform = ['linux', 'macos', 'windows'].includes(getClientPlatform());

const STORAGE_TYPE: Partial<Record<MediaItem['kind'], DownloadedMedia['type']>> = {
  movie: 'Movie', episode: 'Episode', track: 'Audio', album: 'MusicAlbum',
};

export interface DownloadTask {
  itemId: string;
  name: string;
  type: DownloadedMedia['type'];
  progress: number;
  loaded: number;
  total: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  startedAt: number;
  transcoding?: boolean;
  /** Album of a track: the Téléchargés tab shows an album's tracks as one row. */
  groupId?: string;
  groupName?: string;
  /** Kept after a failure, so the download can be retried as it was asked. */
  metadata?: MediaItem;
  transcodeOptions?: TranscodeOptions;
}

export interface TranscodeOptions {
  /** Domain stream ids (see MediaVersion); undefined = server default / no subtitle. */
  audioStreamId?: string;
  subtitleStreamId?: string;
  /**
   * Max streaming bitrate in bps for the transcoded download (e.g. 8_000_000 for
   * 720p). 0 or undefined = keep the source resolution (Auto). A cap forces a
   * real re-encode even when the media is already device-compatible.
   */
  maxBitrate?: number;
  /** User explicitly chose to download the original file — never transcode. */
  forceOriginal?: boolean;
}

interface DownloadStoreState {
  tasks: Map<string, DownloadTask>;
  // Items kept separately — not reactive, just for queue execution
  _itemQueue: Map<string, MediaItem>;
  _transcodeOptionsQueue: Map<string, TranscodeOptions>;
  showIndicator: boolean;
}

function firstVersion(item: MediaItem): MediaVersion | undefined {
  return 'versions' in item ? item.versions[0] : undefined;
}

/** Desktop container/codec rules (desktopCodec) read the first-schema field names. */
function desktopMetadata(item: MediaItem, version: MediaVersion | undefined) {
  const streams = [
    ...(version?.video ?? []).map((v) => ({ Type: 'Video', Codec: v.codec })),
    ...(version?.audio ?? []).map((a) => ({ Type: 'Audio', Codec: a.codec })),
  ];
  return { Type: STORAGE_TYPE[item.kind], Container: version?.container, MediaStreams: streams };
}

/** A quality preset as encoder settings: its bitrate, and its height in a 16:9 box. */
function presetVideo(bitrate: number) {
  const height = QUALITY_PRESETS.find((p) => p.bitrate === bitrate)?.minHeight ?? 0;
  return { bitrate, maxSize: height > 0 ? { width: Math.round((height * 16) / 9), height } : undefined };
}

/** A source larger than the display is bounded to it, at the device's recommended bitrate (never above the source). */
function displaySizedVideo(version: MediaVersion | undefined, device: DeviceCapabilities | undefined) {
  const video = version?.video[0];
  const box = video && device ? displayBoundsFor(video, device) : null;
  if (!box || !device) return undefined;
  const recommended = recommendedTranscodeBitrate(device);
  const bitrate = version?.bitrate ? Math.min(recommended, version.bitrate) : recommended;
  logger.log(`[DownloadStore] Bounding transcoded download to ${box.width}x${box.height} at ${bitrate} bps`);
  return { bitrate, maxSize: box };
}

/**
 * Desktop direct downloads: Chromium's <video> exposes no embedded subtitle
 * tracks, so a text sidecar is picked (preferred language, else default, else first).
 */
function desktopSidecarSubtitle(version: MediaVersion | undefined): string | undefined {
  const textSubs = (version?.subtitles ?? []).filter((s) => s.format === 'text');
  const preferred = usePreferencesStore().preferredSubtitleLanguage;
  const stream = (preferred ? textSubs.find((s) => languageMatches(preferred, s.language || '')) : undefined)
    ?? textSubs.find((s) => s.isDefault) ?? textSubs[0];
  return stream?.id;
}

export const useDownloadStore = defineStore('downloads', {
  state: (): DownloadStoreState => ({
    tasks: new Map(),
    _itemQueue: new Map(),
    _transcodeOptionsQueue: new Map(),
    showIndicator: false,
  }),

  getters: {
    activeDownloads(): DownloadTask[] {
      return Array.from(this.tasks.values()).filter((t) => t.status === 'downloading' || t.status === 'queued');
    },

    completedDownloads(): DownloadTask[] {
      return Array.from(this.tasks.values()).filter((t) => t.status === 'completed');
    },

    hasActiveDownloads(): boolean {
      return this.activeDownloads.length > 0;
    },

    currentDownload(): DownloadTask | null {
      return this.activeDownloads.find((t) => t.status === 'downloading') || null;
    },

    totalProgress(): number {
      const active = this.activeDownloads;
      if (active.length === 0) return 0;
      const totalLoaded = active.reduce((sum, t) => sum + t.loaded, 0);
      const totalSize = active.reduce((sum, t) => sum + t.total, 0);
      return totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0;
    },

    isDownloading: (state) => (itemId: string): boolean => {
      const task = state.tasks.get(itemId);
      return task?.status === 'downloading' || task?.status === 'queued';
    },

    getTask: (state) => (itemId: string): DownloadTask | undefined => state.tasks.get(itemId),
  },

  actions: {
    /** Enqueue a download. Starts immediately if a slot is free, otherwise waits. */
    async startDownload(itemId: string, item: MediaItem, transcodeOptions?: TranscodeOptions) {
      const existing = this.tasks.get(itemId);
      if (existing) {
        if (existing.status === 'cancelled' || existing.status === 'failed') {
          this.tasks.delete(itemId); // stale task: allow a new attempt
        } else if (existing.status === 'downloading' && !downloadService.isDownloading(itemId)) {
          logger.warn('[DownloadStore] Stale downloading task for', itemId, '— allowing retry');
          this.tasks.delete(itemId);
        } else {
          logger.log('[DownloadStore] Already queued/downloading:', itemId);
          return;
        }
      }
      if (!useSessionStore().backend) throw new Error('Not connected to server');

      this.tasks.set(itemId, {
        itemId,
        name: item.title || 'Unknown',
        type: STORAGE_TYPE[item.kind] ?? 'Movie',
        progress: 0,
        loaded: 0,
        total: 0,
        status: 'queued',
        startedAt: Date.now(),
        transcoding: false,
        groupId: item.kind === 'track' ? item.albumId : undefined,
        groupName: item.kind === 'track' ? item.albumTitle : undefined,
      });
      this._itemQueue.set(itemId, item);
      if (transcodeOptions) this._transcodeOptionsQueue.set(itemId, transcodeOptions);
      this.showIndicator = true;
      this._processQueue();
    },

    /** Process the queue: start up to MAX_CONCURRENT downloads. */
    _processQueue() {
      const downloading = Array.from(this.tasks.values()).filter((t) => t.status === 'downloading').length;
      const slots = MAX_CONCURRENT - downloading;
      if (slots <= 0) return;
      const queued = Array.from(this.tasks.values()).filter((t) => t.status === 'queued').slice(0, slots);
      for (const task of queued) this._executeDownload(task.itemId);
    },

    /**
     * What to ask the server for: the original, a capped transcode (quality
     * preset), or — when this device can't play the source — a display-sized one.
     */
    async _downloadRequest(item: MediaItem, options: TranscodeOptions | undefined): Promise<DownloadRequest> {
      const version = firstVersion(item);
      const device = Capacitor.isNativePlatform() ? await deviceCapabilities() : undefined;
      const base = { itemId: item.id, target: isDesktopPlatform ? 'desktop' as const : 'native' as const, device };
      const cap = options?.maxBitrate ?? 0;
      const canTranscode = !options?.forceOriginal && (Capacitor.isNativePlatform() || isDesktopPlatform);
      let transcode: DownloadRequest['transcode'];
      if (canTranscode && cap > 0) {
        transcode = { maxBitrate: cap, video: presetVideo(cap), audioStreamId: options?.audioStreamId };
      } else if (canTranscode && await this.checkNeedsTranscode(item)) {
        transcode = { video: displaySizedVideo(version, device), audioStreamId: options?.audioStreamId };
      }
      const subtitleStreamId = options?.subtitleStreamId
        ?? (isDesktopPlatform && !transcode ? desktopSidecarSubtitle(version) : undefined);
      return { ...base, transcode, subtitleStreamId };
    },

    /** Actually run a single download. Called internally when a slot is free. */
    async _executeDownload(itemId: string) {
      const task = this.tasks.get(itemId);
      const queued = this._itemQueue.get(itemId);
      if (!task || !queued) return;

      // Take the slot now: the next _processQueue() call can run before the awaits below.
      task.status = 'downloading';
      const session = useSessionStore();
      const backend = session.backend;
      const serverId = session.active?.serverId ?? '';
      const transcodeOptions = this._transcodeOptionsQueue.get(itemId);
      let item = queued;

      try {
        if (!backend) throw new Error('Not connected to server');
        // List/bulk items can omit cast, streams and artwork: store the complete item offline.
        item = await backend.catalog.item(itemId).catch(() => queued);
        // Recorded with the download so it lands in the right library even offline.
        const libraryId = await backend.catalog.libraryOf(itemId).catch(() => undefined);
        if (this.tasks.get(itemId)?.status === 'cancelled') return;

        const plan = await backend.downloads.plan(await this._downloadRequest(item, transcodeOptions));
        task.transcoding = plan.isTranscoded;
        await downloadService.downloadForOffline(item, serverId, plan, artworkResolverFor(backend), (progress) => {
          const t = this.tasks.get(itemId);
          if (!t) return;
          t.progress = progress.percentage >= 0 ? progress.percentage : 0;
          t.loaded = progress.loaded;
          // Never reset a known total back to 0 (a later event may lack content-length).
          if (progress.total > 0 || t.total === 0) t.total = progress.total;
        });

        const t = this.tasks.get(itemId);
        if (t) { t.status = 'completed'; t.progress = 100; }
        if (libraryId) await offlineDatabase.patchDownload(itemId, { libraryId });
        const offlineStore = useOfflineStore();
        await offlineStore.loadDownloads();
        void offlineStore.backfillLibraryIds();
        // Parent metadata and artwork are part of a completed episode download.
        if (item.kind === 'episode') await this._cacheParentMetadata(item, backend);
        logger.log('[DownloadStore] Completed:', item.title);
      } catch (error: any) {
        const t = this.tasks.get(itemId);
        if (t) {
          t.status = error?.name === 'AbortError' ? 'cancelled' : 'failed';
          if (t.status === 'failed') {
            t.error = error?.message || 'Download failed';
            t.metadata = item;
            t.transcodeOptions = transcodeOptions;
          }
        }
        // The download runs after startDownload() resolved, so no caller sees this failure.
        if (error?.name !== 'AbortError') {
          useToast().showError(i18n.global.t('detail.downloadEpisodeFailed', { name: item.title }));
        }
      } finally {
        this._itemQueue.delete(itemId);
        this._transcodeOptionsQueue.delete(itemId);
        this._processQueue();
      }
    },

    /** Fetch and cache the series and season of an episode, with their artwork. */
    async _cacheParentMetadata(episode: MediaItem & { kind: 'episode' }, backend: MediaBackend) {
      const metaCache = useMetadataCacheStore();
      const parentIds = [episode.seriesId, episode.seasonId].filter((id): id is string => !!id);
      for (const id of parentIds) {
        let parent = metaCache.get(id, true);
        if (!parent) {
          try {
            parent = await backend.catalog.item(id);
            metaCache.set(parent);
          } catch (error) {
            logger.warn('[DownloadStore] Could not cache parent metadata:', id, error);
            continue;
          }
        }
        await downloadService.cacheArtwork(buildOfflineArtworkTargets(parent), artworkResolverFor(backend));
      }
    },

    /**
     * Whether any video or audio stream is unsupported by this device
     * (a transcode would then be needed to play it offline).
     */
    async checkNeedsTranscode(item: MediaItem): Promise<boolean> {
      const version = firstVersion(item);
      if (isDesktopPlatform) return needsDesktopTranscode(desktopMetadata(item, version));
      if (!Capacitor.isNativePlatform() || !version) return false;
      try {
        const device = await deviceCapabilities();
        if (!device.isKnown) return false;
        if (version.audio.some((a) => !isAudioCodecSupported(a.codec, a.profile, device))) return true;
        for (const video of version.video) {
          if (exceedsDisplay(video, device)) return true;
          if ((await canHardwareDecodeVideo(video)).supported) continue;
          const canUseSoftware = (video.height || 0) <= MAX_SOFTWARE_DECODE_HEIGHT && canSoftwareDecode(video, device);
          if (!canUseSoftware) return true;
        }
        return false;
      } catch {
        return false;
      }
    },

    /** Starts a failed download again, as it was asked. */
    async retry(itemId: string) {
      const task = this.tasks.get(itemId);
      if (task?.status !== 'failed' || !task.metadata) return;
      await this.startDownload(itemId, task.metadata, task.transcodeOptions);
    },

    cancelDownload(itemId: string) {
      const task = this.tasks.get(itemId);
      if (!task) return;
      if (task.status === 'queued') {
        task.status = 'cancelled';
        this._itemQueue.delete(itemId);
        this._transcodeOptionsQueue.delete(itemId);
        this._processQueue();
      } else {
        downloadService.cancelDownload(itemId);
        task.status = 'cancelled';
      }
    },

    cancelAll() {
      for (const task of this.tasks.values()) {
        if (task.status === 'queued') {
          task.status = 'cancelled';
          this._itemQueue.delete(task.itemId);
          this._transcodeOptionsQueue.delete(task.itemId);
        } else if (task.status === 'downloading') {
          downloadService.cancelDownload(task.itemId);
          task.status = 'cancelled';
        }
      }
    },

    removeTask(itemId: string) {
      this.tasks.delete(itemId);
      this._itemQueue.delete(itemId);
      this._transcodeOptionsQueue.delete(itemId);
      if (this.tasks.size === 0) this.showIndicator = false;
    },

    clearCompleted() {
      for (const [id, task] of this.tasks) {
        if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') this.tasks.delete(id);
      }
      if (this.tasks.size === 0) this.showIndicator = false;
    },
  },
});
