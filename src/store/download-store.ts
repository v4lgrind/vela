import { defineStore } from 'pinia';
import { Capacitor } from '@capacitor/core';

import { getClientPlatform } from '@/composables/usePlatform';
import { downloadService } from '@/services/downloadService';
import { CODEC_MIME_MAP, isDolbyVision } from '@/utils/codecDetection';
import { needsDesktopTranscode } from '@/utils/desktopCodec';
import { languageMatches } from '@/utils/language';
import { logger } from '@/utils/logger';

import { useJellyfinStore } from './jellyfin-store';
import { useMetadataCacheStore } from './metadata-cache-store';
import { useOfflineStore } from './offline-store';
import { usePreferencesStore } from './preferences-store';

const MAX_CONCURRENT = 3;
const clientPlatform = getClientPlatform();
const isDesktopPlatform = ['linux', 'macos', 'windows'].includes(clientPlatform);

/**
 * Pick a text subtitle stream for a sidecar download: the user's preferred
 * language first, then the default-flagged stream, then the first text stream.
 */
function pickSidecarSubtitle(
  metadata: any,
): { streamIndex: number; label: string; language: string } | undefined {
  const streams: any[] = metadata.MediaStreams || metadata.MediaSources?.[0]?.MediaStreams || [];
  const textSubs = streams.filter((s: any) => s.Type === 'Subtitle' && s.IsTextSubtitleStream);
  if (textSubs.length === 0) return undefined;

  const preferredLanguage = usePreferencesStore().preferredSubtitleLanguage;
  const stream = (preferredLanguage
    ? textSubs.find((s: any) => languageMatches(preferredLanguage, s.Language || ''))
    : undefined)
    || textSubs.find((s: any) => s.IsDefault)
    || textSubs[0];

  return {
    streamIndex: stream.Index,
    label: stream.DisplayTitle || stream.Language || 'Unknown',
    language: stream.Language || 'und',
  };
}

export interface DownloadTask {
  itemId: string;
  name: string;
  type: 'Movie' | 'Episode' | 'Audio' | 'MusicAlbum';
  progress: number;
  loaded: number;
  total: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  startedAt: number;
  transcoding?: boolean;
}

export interface TranscodeOptions {
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
}

interface DownloadStoreState {
  tasks: Map<string, DownloadTask>;
  // Metadata kept separately — not reactive, just for queue execution
  _metadataQueue: Map<string, any>;
  _transcodeOptionsQueue: Map<string, TranscodeOptions>;
  showIndicator: boolean;
}

export const useDownloadStore = defineStore('downloads', {
  state: (): DownloadStoreState => ({
    tasks: new Map(),
    _metadataQueue: new Map(),
    _transcodeOptionsQueue: new Map(),
    showIndicator: false,
  }),

  getters: {
    activeDownloads(): DownloadTask[] {
      return Array.from(this.tasks.values()).filter(
        (t) => t.status === 'downloading' || t.status === 'queued'
      );
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

    isDownloading:
      (state) =>
      (itemId: string): boolean => {
        const task = state.tasks.get(itemId);
        return task?.status === 'downloading' || task?.status === 'queued';
      },

    getTask:
      (state) =>
      (itemId: string): DownloadTask | undefined => {
        return state.tasks.get(itemId);
      },
  },

  actions: {
    /** Enqueue a download. Starts immediately if a slot is free, otherwise waits. */
    async startDownload(itemId: string, metadata: any, transcodeOptions?: TranscodeOptions) {
      const existing = this.tasks.get(itemId);
      if (existing) {
        if (existing.status === 'cancelled' || existing.status === 'failed') {
          // Clear stale task so it can be retried
          this.tasks.delete(itemId);
        } else if (existing.status === 'downloading' && !downloadService.isDownloading(itemId)) {
          logger.warn('[DownloadStore] Stale downloading task for', itemId, '— allowing retry');
          this.tasks.delete(itemId);
        } else if (existing.status === 'downloading' || existing.status === 'queued') {
          logger.log('[DownloadStore] Already queued/downloading:', itemId);
          return;
        }
      }

      const jellyfinStore = useJellyfinStore();
      if (!jellyfinStore.serverUrl || !jellyfinStore.accessToken) {
        throw new Error('Not connected to server');
      }

      const task: DownloadTask = {
        itemId,
        name: metadata.Name || 'Unknown',
        type: metadata.Type,
        progress: 0,
        loaded: 0,
        total: 0,
        status: 'queued',
        startedAt: Date.now(),
        transcoding: false,
      };

      this.tasks.set(itemId, task);
      this._metadataQueue.set(itemId, metadata);
      if (transcodeOptions) {
        this._transcodeOptionsQueue.set(itemId, transcodeOptions);
      }
      this.showIndicator = true;

      this._processQueue();
    },

    /** Process the queue: start up to MAX_CONCURRENT downloads. */
    _processQueue() {
      const downloading = Array.from(this.tasks.values()).filter(
        (t) => t.status === 'downloading'
      ).length;

      const slots = MAX_CONCURRENT - downloading;
      if (slots <= 0) return;

      const queued = Array.from(this.tasks.values())
        .filter((t) => t.status === 'queued')
        .slice(0, slots);

      for (const task of queued) {
        this._executeDownload(task.itemId);
      }
    },

    /** Actually run a single download. Called internally when a slot is free. */
    async _executeDownload(itemId: string) {
      const task = this.tasks.get(itemId);
      const metadata = this._metadataQueue.get(itemId);
      if (!task || !metadata) return;

      const jellyfinStore = useJellyfinStore();
      const transcodeOptions = this._transcodeOptionsQueue.get(itemId);

      task.status = 'downloading';

      try {
        // Check if video codec needs transcoding before downloading
        let transcodedUrl: string | undefined;
        let transcodedContainer: string | undefined;
        let estimatedTranscodeSize = 0;
        if (Capacitor.isNativePlatform() || isDesktopPlatform) {
          const transcodeResult = await this._getTranscodeUrlIfNeeded(itemId, metadata, jellyfinStore, transcodeOptions);
          if (transcodeResult) {
            transcodedUrl = transcodeResult.url;
            transcodedContainer = transcodeResult.container;
            estimatedTranscodeSize = transcodeResult.estimatedSize;
            task.transcoding = true;
          }
        }

        // Build subtitle info for sidecar download (when user chose a subtitle track)
        let subtitleInfo: { streamIndex: number; label: string; language: string } | undefined;
        if (transcodeOptions?.subtitleStreamIndex != null && transcodeOptions.subtitleStreamIndex >= 0) {
          const streams: any[] = metadata.MediaStreams || [];
          const subStream = streams.find((s: any) => s.Index === transcodeOptions.subtitleStreamIndex);
          subtitleInfo = {
            streamIndex: transcodeOptions.subtitleStreamIndex,
            label: subStream?.DisplayTitle || subStream?.Language || 'Unknown',
            language: subStream?.Language || 'und',
          };
        } else if (isDesktopPlatform && !transcodedUrl) {
          // Desktop direct downloads: auto-pick a text subtitle. Chromium's
          // <video> exposes no embedded subtitle tracks, so without a sidecar
          // a directly downloaded file has no subtitles offline at all.
          subtitleInfo = pickSidecarSubtitle(metadata);
        }

        await downloadService.downloadForOffline(
          jellyfinStore.serverUrl!,
          itemId,
          jellyfinStore.accessToken!,
          metadata,
          (progress) => {
            const t = this.tasks.get(itemId);
            if (t) {
              t.progress = progress.percentage >= 0 ? progress.percentage : 0;
              t.loaded = progress.loaded;
              // Never reset a known total back to 0 — a later event with no content-length
              // would otherwise wipe out the estimated size we calculated upfront.
              if (progress.total > 0 || t.total === 0) {
                t.total = progress.total;
              }
            }
          },
          transcodedUrl,
          estimatedTranscodeSize || undefined,
          subtitleInfo,
          transcodedContainer,
        );

        const t = this.tasks.get(itemId);
        if (t) { t.status = 'completed'; t.progress = 100; }

        const offlineStore = useOfflineStore();
        await offlineStore.loadDownloads();

        // Cache series and season metadata so their detail pages work offline
        if (metadata.Type === 'Episode') {
          this._cacheParentMetadata(metadata, jellyfinStore);
        }

        logger.log('[DownloadStore] Completed:', metadata.Name);
      } catch (error: any) {
        const t = this.tasks.get(itemId);
        if (t) {
          t.status = error?.name === 'AbortError' ? 'cancelled' : 'failed';
          if (t.status === 'failed') t.error = error.message || 'Download failed';
        }
      } finally {
        this._metadataQueue.delete(itemId);
        this._transcodeOptionsQueue.delete(itemId);
        // Start next queued item regardless of outcome
        this._processQueue();
      }
    },

    /** Fetch and cache Series + Season metadata in the background (fire-and-forget). */
    async _cacheParentMetadata(episodeMetadata: any, jellyfinStore: ReturnType<typeof useJellyfinStore>) {
      const metaCache = useMetadataCacheStore();
      const toFetch: string[] = [];
      if (episodeMetadata.SeriesId && !metaCache.has(episodeMetadata.SeriesId)) {
        toFetch.push(episodeMetadata.SeriesId);
      }
      if (episodeMetadata.SeasonId && !metaCache.has(episodeMetadata.SeasonId)) {
        toFetch.push(episodeMetadata.SeasonId);
      }
      if (toFetch.length === 0) return;
      await Promise.allSettled(
        toFetch.map(id =>
          jellyfinStore.fetchItemDetails(id).then(item => { if (item) metaCache.set(item); }).catch(() => {})
        )
      );
    },

    /**
     * Check if any video or audio codec in the media is unsupported by the device.
     * Returns true if transcoding would be beneficial.
     */
    async checkNeedsTranscode(metadata: any): Promise<boolean> {
      if (isDesktopPlatform) return needsDesktopTranscode(metadata);
      if (!Capacitor.isNativePlatform()) return false;
      try {
        const { getDeviceCodecs } = await import('@/utils/codecDetection');
        const { NativeVideo } = await import('@/plugins/NativeVideoPlugin');
        const deviceCodecs = await getDeviceCodecs();
        if (deviceCodecs.length === 0) return false;

        const streams: any[] = metadata.MediaStreams || metadata.MediaSources?.[0]?.MediaStreams || [];
        const MAX_SW_HEIGHT = 1080;

        for (const stream of streams) {
          const codec = (stream.Codec || '').toLowerCase();
          const profile = (stream.Profile || '').toLowerCase();
          const mime = CODEC_MIME_MAP[codec];
          if (!mime) continue;

          const effectiveMime = isDolbyVision(codec, profile) ? 'video/dolby-vision' : mime;

          if (!deviceCodecs.includes(effectiveMime)) {
            if (stream.Type === 'Video' && (stream.Height || 0) <= MAX_SW_HEIGHT) continue;
            return true;
          }

          if ((codec === 'hevc' || codec === 'h265') && stream.Type === 'Video') {
            const checkProfile = (stream.Profile as string) || 'Main 10';
            const checkLevel = (stream.Level as number) || 153;
            const { supported } = await NativeVideo.canDecodeHevc({ profile: checkProfile, level: checkLevel, hardwareOnly: true });
            if (!supported && (stream.Height || 0) > MAX_SW_HEIGHT) return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    },

    async _getTranscodeUrlIfNeeded(
      itemId: string,
      metadata: any,
      jellyfinStore: ReturnType<typeof useJellyfinStore>,
      transcodeOptions?: TranscodeOptions,
    ): Promise<{ container: string; url: string; estimatedSize: number } | undefined> {
      try {
        // If user explicitly chose transcode options, always transcode.
        // Otherwise, auto-detect based on device codec capabilities.
        const forceTranscode = transcodeOptions != null;

        if (!forceTranscode) {
          const needsTranscode = await this.checkNeedsTranscode(metadata);
          if (!needsTranscode) return undefined;
        }

        // Request a transcoding URL from Jellyfin
        logger.log(`[DownloadStore] Requesting transcoded download for ${itemId}` +
          (transcodeOptions ? ` (audio=${transcodeOptions.audioStreamIndex} sub=${transcodeOptions.subtitleStreamIndex})` : ' (auto-detected)'));
        const serverUrl = jellyfinStore.serverUrl!;
        const token = jellyfinStore.accessToken!;
        const transcodeContainer = isDesktopPlatform ? 'mp4' : 'ts';

        const requestBody: any = {
          DeviceProfile: {
            DirectPlayProfiles: [],
            TranscodingProfiles: [
              {
                Container: transcodeContainer,
                Type: 'Video',
                VideoCodec: 'h264',
                AudioCodec: isDesktopPlatform ? 'aac' : 'aac,mp3,ac3',
                Context: 'Streaming',
                Protocol: 'http',
                CopyTimestamps: true,
                MaxAudioChannels: '8',
              },
            ],
            SubtitleProfiles: [
              { Format: 'srt',    Method: 'External' },
              { Format: 'subrip', Method: 'External' },
              { Format: 'ass',    Method: 'External' },
              { Format: 'ssa',    Method: 'External' },
              { Format: 'pgs',    Method: 'External' },
              { Format: 'pgssub', Method: 'External' },
            ],
            CodecProfiles: [],
          },
          MediaSourceId: itemId,
          AllowVideoStreamCopy: false,
          AllowAudioStreamCopy: !isDesktopPlatform,
        };

        if (transcodeOptions?.audioStreamIndex != null) {
          requestBody.AudioStreamIndex = transcodeOptions.audioStreamIndex;
        }
        // Subtitles are downloaded separately as sidecar files — don't include in transcode

        const response = await fetch(
          `${serverUrl}/Items/${itemId}/PlaybackInfo?userId=${jellyfinStore.userId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Emby-Token': token,
            },
            body: JSON.stringify(requestBody),
          }
        );

        if (!response.ok) {
          logger.warn(`[DownloadStore] PlaybackInfo request failed: ${response.status} ${response.statusText}`);
          return undefined;
        }
        const result = await response.json();
        const ms = result.MediaSources?.[0];
        logger.log(`[DownloadStore] PlaybackInfo response: TranscodingUrl=${ms?.TranscodingUrl} SupportsTranscoding=${ms?.SupportsTranscoding} Protocol=${ms?.TranscodingSubProtocol}`);

        if (ms?.TranscodingUrl) {
          const url = `${serverUrl}${ms.TranscodingUrl}`;
          const estimatedSize = (ms.Bitrate && ms.RunTimeTicks)
            ? Math.ceil((ms.Bitrate / 8) * (ms.RunTimeTicks / 10_000_000))
            : 0;
          logger.log(`[DownloadStore] Transcoded URL (est. ${Math.round(estimatedSize / 1024 / 1024)}MB): ${url}`);
          return { container: transcodeContainer, url, estimatedSize };
        }

        logger.warn('[DownloadStore] PlaybackInfo returned no TranscodingUrl — falling back to raw download');
        return undefined;
      } catch (e) {
        logger.warn('[DownloadStore] Codec check failed, downloading raw:', e);
        return undefined;
      }
    },

    cancelDownload(itemId: string) {
      const task = this.tasks.get(itemId);
      if (!task) return;
      if (task.status === 'queued') {
        task.status = 'cancelled';
        this._metadataQueue.delete(itemId);
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
          this._metadataQueue.delete(task.itemId);
          this._transcodeOptionsQueue.delete(task.itemId);
        } else if (task.status === 'downloading') {
          downloadService.cancelDownload(task.itemId);
          task.status = 'cancelled';
        }
      }
    },

    removeTask(itemId: string) {
      this.tasks.delete(itemId);
      this._metadataQueue.delete(itemId);
      this._transcodeOptionsQueue.delete(itemId);
      if (this.tasks.size === 0) this.showIndicator = false;
    },

    clearCompleted() {
      for (const [id, task] of this.tasks) {
        if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
          this.tasks.delete(id);
        }
      }
      if (this.tasks.size === 0) this.showIndicator = false;
    },
  },
});
