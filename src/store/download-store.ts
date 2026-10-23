import { defineStore } from 'pinia';
import { Capacitor } from '@capacitor/core';

import { getClientPlatform } from '@/composables/usePlatform';
import { QUALITY_PRESETS } from '@/constants';
import { downloadService } from '@/services/downloadService';
import {
  canHardwareDecodeVideo,
  canSoftwareDecodeVideo,
  exceedsDeviceDisplay,
  getDeviceCapabilities,
  getDisplayBoundsForSource,
  getRecommendedNativeTranscodeBitrate,
  isAudioStreamSupported,
  withDeviceAudioCodecs,
} from '@/utils/codecDetection';
import { needsDesktopTranscode } from '@/utils/desktopCodec';
import { languageMatches } from '@/utils/language';
import { jellyfinAuthorization } from '@/utils/jellyfinAuthorization';
import { logger } from '@/utils/logger';
import type { MediaStream } from '@/types/jellyfin';

import { useJellyfinStore } from './jellyfin-store';
import { useMetadataCacheStore } from './metadata-cache-store';
import { useOfflineStore } from './offline-store';
import { usePreferencesStore } from './preferences-store';

const MAX_CONCURRENT = 3;
const clientPlatform = getClientPlatform();
const isDesktopPlatform = ['linux', 'macos', 'windows'].includes(clientPlatform);

/**
 * Force resolution + video bitrate on a Jellyfin transcode URL.
 *
 * Jellyfin does not reliably apply `MaxStreamingBitrate` from the device profile to
 * downloaded (progressive) transcodes — it can transcode at the source resolution and
 * ignore the cap, producing a file even larger than the original. Setting
 * `maxWidth`/`maxHeight`/`videoBitRate` directly on the stream URL is honoured
 * unconditionally. Existing values are replaced case-insensitively so ASP.NET never
 * sees duplicate keys. `width` defaults to a 16:9 box around `height`.
 */
export function withForcedVideoParams(
  rawUrl: string,
  videoBitrate: number,
  height: number,
  width = Math.round((height * 16) / 9),
): string {
  try {
    const u = new URL(rawUrl);
    const setParam = (key: string, value: string) => {
      for (const existing of [...u.searchParams.keys()]) {
        if (existing.toLowerCase() === key.toLowerCase()) u.searchParams.delete(existing);
      }
      u.searchParams.set(key, value);
    };
    setParam('videoBitRate', String(videoBitrate));
    if (height > 0) {
      setParam('maxHeight', String(height));
      setParam('maxWidth', String(width));
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Bound an auto-detected transcode of a source larger than the display to the
 * display size and the device's recommended bitrate (never above the source).
 */
async function withDisplaySizedDownload(
  url: string,
  streams: MediaStream[],
  sourceBitrate: number,
): Promise<{ url: string; videoBitrate: number } | undefined> {
  const video = streams.find((stream) => stream.Type === 'Video');
  if (!video) return undefined;
  const capabilities = await getDeviceCapabilities();
  const bounds = getDisplayBoundsForSource(video, capabilities);
  if (!bounds) return undefined;

  const recommendedBitrate = getRecommendedNativeTranscodeBitrate(capabilities);
  const videoBitrate = sourceBitrate > 0
    ? Math.min(recommendedBitrate, sourceBitrate)
    : recommendedBitrate;
  logger.log(`[DownloadStore] Bounding transcoded download to ${bounds.maxWidth}x${bounds.maxHeight} at ${videoBitrate} bps`);
  return {
    url: withForcedVideoParams(url, videoBitrate, bounds.maxHeight, bounds.maxWidth),
    videoBitrate,
  };
}

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
  /**
   * Max streaming bitrate in bps for the transcoded download (e.g. 8_000_000 for
   * 720p). 0 or undefined = keep the source resolution (Auto). A cap forces a
   * real re-encode even when the media is already device-compatible.
   */
  maxBitrate?: number;
  /** User explicitly chose to download the original file — never transcode. */
  forceOriginal?: boolean;
}

interface EpisodeParentMetadata {
  SeriesId?: string;
  SeasonId?: string;
}

interface CodecMetadata {
  MediaStreams?: MediaStream[];
  MediaSources?: Array<{ MediaStreams?: MediaStream[] }>;
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
      let metadata = this._metadataQueue.get(itemId);
      if (!task || !metadata) return;

      // Take the slot now: the next _processQueue() call can run before the await below.
      task.status = 'downloading';
      const jellyfinStore = useJellyfinStore();
      const transcodeOptions = this._transcodeOptionsQueue.get(itemId);

      // List/bulk responses can omit People and other detail fields. Persist the
      // complete item so summary, cast, streams, and artwork remain available offline.
      try {
        const detailedMetadata = await jellyfinStore.fetchItemDetails(itemId);
        metadata = { ...metadata, ...detailedMetadata };
        this._metadataQueue.set(itemId, metadata);
      } catch (error) {
        logger.warn('[DownloadStore] Could not enrich offline metadata:', itemId, error);
      }
      if (this.tasks.get(itemId)?.status === 'cancelled') {
        this._processQueue();
        return;
      }

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

        // Parent metadata and artwork are part of a completed episode download.
        if (metadata.Type === 'Episode') {
          await this._cacheParentMetadata(metadata, jellyfinStore);
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

    /** Fetch and cache Series + Season metadata and artwork for an episode. */
    async _cacheParentMetadata(
      episodeMetadata: EpisodeParentMetadata,
      jellyfinStore: ReturnType<typeof useJellyfinStore>,
    ) {
      const metaCache = useMetadataCacheStore();
      const parentIds = [episodeMetadata.SeriesId, episodeMetadata.SeasonId]
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      for (const id of parentIds) {
        let parent = metaCache.get(id, true);
        if (!parent) {
          try {
            const fetched = await jellyfinStore.fetchItemDetails(id);
            if (!fetched) continue;
            metaCache.set(fetched);
            parent = metaCache.get(id, true);
          } catch (error) {
            logger.warn('[DownloadStore] Could not cache parent metadata:', id, error);
            continue;
          }
        }
        if (parent && jellyfinStore.serverUrl && jellyfinStore.accessToken) {
          await downloadService.cacheArtworkForMetadata(
            jellyfinStore.serverUrl,
            jellyfinStore.accessToken,
            parent,
          );
        }
      }
    },

    /**
     * Check if any video or audio codec in the media is unsupported by the device.
     * Returns true if transcoding would be beneficial.
     */
    async checkNeedsTranscode(metadata: CodecMetadata): Promise<boolean> {
      if (isDesktopPlatform) return needsDesktopTranscode(metadata);
      if (!Capacitor.isNativePlatform()) return false;
      try {
        const capabilities = await getDeviceCapabilities();
        if (capabilities.androidApi <= 0) return false;

        const streams: MediaStream[] =
          metadata.MediaStreams || metadata.MediaSources?.[0]?.MediaStreams || [];
        const maxSoftwareHeight = 1080;

        for (const stream of streams) {
          if (stream.Type === 'Audio' && !isAudioStreamSupported(stream, capabilities)) {
            return true;
          }
          if (stream.Type !== 'Video') continue;

          if (exceedsDeviceDisplay(stream, capabilities)) return true;

          const hardwareResult = await canHardwareDecodeVideo(stream);
          if (hardwareResult.supported) continue;

          const canUseSoftware = (stream.Height || 0) <= maxSoftwareHeight
            && canSoftwareDecodeVideo(stream, capabilities);
          if (!canUseSoftware) return true;
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
        // Decide whether this download needs transcoding:
        //  - forceOriginal: user explicitly kept the original file — never transcode.
        //  - a resolution/bitrate cap always forces a re-encode, even for a
        //    device-compatible file (that's the whole point of downscaling).
        //  - otherwise, auto-detect based on device codec capabilities.
        if (transcodeOptions?.forceOriginal) return undefined;

        const bitrateCap = transcodeOptions?.maxBitrate ?? 0;
        const hasBitrateCap = bitrateCap > 0;

        if (!hasBitrateCap) {
          const needsTranscode = await this.checkNeedsTranscode(metadata);
          if (!needsTranscode) return undefined;
        }

        // Request a transcoding URL from Jellyfin
        logger.log(`[DownloadStore] Requesting transcoded download for ${itemId}` +
          (transcodeOptions ? ` (audio=${transcodeOptions.audioStreamIndex} sub=${transcodeOptions.subtitleStreamIndex} maxBitrate=${bitrateCap || 'auto'})` : ' (auto-detected)'));
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
                AudioCodec: isDesktopPlatform ? 'aac' : 'aac,mp3,ac3,eac3',
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
        // Only stream-copy audio this device can decode offline (no-op off Android).
        requestBody.DeviceProfile = withDeviceAudioCodecs(
          requestBody.DeviceProfile,
          await getDeviceCapabilities(),
        );

        // Resolution cap: MaxStreamingBitrate + AllowVideoStreamCopy:false (set
        // above) forces Jellyfin to re-encode down to the requested bitrate,
        // scaling the resolution to match — mirrors the streaming quality picker.
        if (hasBitrateCap) {
          requestBody.MaxStreamingBitrate = bitrateCap;
          requestBody.DeviceProfile.MaxStreamingBitrate = bitrateCap;
        }

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
              Authorization: jellyfinAuthorization(token),
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
        logger.log(`[DownloadStore] PlaybackInfo response: HasTranscodingUrl=${Boolean(ms?.TranscodingUrl)} SupportsTranscoding=${ms?.SupportsTranscoding} Protocol=${ms?.TranscodingSubProtocol}`);

        if (ms?.TranscodingUrl) {
          const streamUrl = new URL(`${serverUrl}${ms.TranscodingUrl}`);
          // The transport authenticates with a header; server-provided stream URLs
          // may still include a query token, which Jellyfin 12 no longer accepts.
          for (const key of [...streamUrl.searchParams.keys()]) {
            if (key.toLowerCase() === 'api_key' || key.toLowerCase() === 'apikey') {
              streamUrl.searchParams.delete(key);
            }
          }
          let url = streamUrl.toString();
          // Bitrate we expect the video track to actually be encoded at. Defaults to
          // whatever Jellyfin reports, but a cap forces the real value on the URL below.
          let effectiveVideoBitrate = ms.Bitrate || 0;

          if (hasBitrateCap) {
            const targetHeight = QUALITY_PRESETS.find((p) => p.bitrate === bitrateCap)?.minHeight ?? 0;
            url = withForcedVideoParams(url, bitrateCap, targetHeight);
            effectiveVideoBitrate = bitrateCap;
          } else {
            const streams: MediaStream[] = ms.MediaStreams
              || metadata.MediaStreams
              || metadata.MediaSources?.[0]?.MediaStreams
              || [];
            const bounded = await withDisplaySizedDownload(url, streams, ms.Bitrate || 0);
            if (bounded) {
              url = bounded.url;
              effectiveVideoBitrate = bounded.videoBitrate;
            }
          }

          const runtimeSec = (ms.RunTimeTicks || metadata.RunTimeTicks || 0) / 10_000_000;
          const estimatedSize = (effectiveVideoBitrate && runtimeSec)
            ? Math.ceil((effectiveVideoBitrate / 8) * runtimeSec)
            : 0;
          logger.log(`[DownloadStore] Transcoded download estimated at ${Math.round(estimatedSize / 1024 / 1024)}MB`);
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
