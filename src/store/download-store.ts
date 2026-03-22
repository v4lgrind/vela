import { defineStore } from 'pinia';
import { downloadService } from '@/services/downloadService';
import { useOfflineStore } from './offline-store';
import { useJellyfinStore } from './jellyfin-store';
import { useMetadataCacheStore } from './metadata-cache-store';
import { Capacitor } from '@capacitor/core';

const MAX_CONCURRENT = 3;

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

interface DownloadStoreState {
  tasks: Map<string, DownloadTask>;
  // Metadata kept separately — not reactive, just for queue execution
  _metadataQueue: Map<string, any>;
  showIndicator: boolean;
}

export const useDownloadStore = defineStore('downloads', {
  state: (): DownloadStoreState => ({
    tasks: new Map(),
    _metadataQueue: new Map(),
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
    async startDownload(itemId: string, metadata: any) {
      const existing = this.tasks.get(itemId);
      if (existing?.status === 'downloading' || existing?.status === 'queued') {
        console.log('[DownloadStore] Already queued/downloading:', itemId);
        return;
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

      task.status = 'downloading';

      try {
        // Check if video codec needs transcoding before downloading
        let transcodedUrl: string | undefined;
        let estimatedTranscodeSize = 0;
        if (Capacitor.isNativePlatform()) {
          const transcodeResult = await this._getTranscodeUrlIfNeeded(itemId, metadata, jellyfinStore);
          if (transcodeResult) {
            transcodedUrl = transcodeResult.url;
            estimatedTranscodeSize = transcodeResult.estimatedSize;
            task.transcoding = true;
          }
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
        );

        const t = this.tasks.get(itemId);
        if (t) { t.status = 'completed'; t.progress = 100; }

        const offlineStore = useOfflineStore();
        await offlineStore.loadDownloads();

        // Cache series and season metadata so their detail pages work offline
        if (metadata.Type === 'Episode') {
          this._cacheParentMetadata(metadata, jellyfinStore);
        }

        console.log('[DownloadStore] Completed:', metadata.Name);
      } catch (error: any) {
        const t = this.tasks.get(itemId);
        if (t) {
          t.status = error?.name === 'AbortError' ? 'cancelled' : 'failed';
          if (t.status === 'failed') t.error = error.message || 'Download failed';
        }
      } finally {
        this._metadataQueue.delete(itemId);
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
     * If so, request a transcoding URL from Jellyfin's PlaybackInfo API.
     * Returns the URL and an estimated file size (bytes) derived from Bitrate × duration.
     */
    async _getTranscodeUrlIfNeeded(
      itemId: string,
      metadata: any,
      jellyfinStore: ReturnType<typeof useJellyfinStore>
    ): Promise<{ url: string; estimatedSize: number } | undefined> {
      try {
        // Get device codec capabilities
        const { NativeVideo } = await import('@/plugins/NativeVideoPlugin');
        const { codecs: deviceCodecs } = await NativeVideo.getDeviceCodecs();
        if (deviceCodecs.length === 0) return undefined;

        // Check all media streams for unsupported codecs
        const streams: any[] = metadata.MediaStreams || metadata.MediaSources?.[0]?.MediaStreams || [];
        const CODEC_MIME_MAP: Record<string, string> = {
          // Video
          dvhe: 'video/dolby-vision', dvh1: 'video/dolby-vision',
          hevc: 'video/hevc', h265: 'video/hevc',
          h264: 'video/avc', avc: 'video/avc',
          vp8: 'video/x-vnd.on2.vp8', vp9: 'video/x-vnd.on2.vp9',
          av1: 'video/av01',
          // Audio
          ac3: 'audio/ac3', eac3: 'audio/eac3',
          dts: 'audio/vnd.dts', truehd: 'audio/true-hd',
          flac: 'audio/flac', opus: 'audio/opus',
          vorbis: 'audio/vorbis', aac: 'audio/mp4a-latm',
          mp3: 'audio/mpeg',
        };

        let needsTranscode = false;
        for (const stream of streams) {
          const codec = (stream.Codec || '').toLowerCase();
          const profile = (stream.Profile || '').toLowerCase();
          const mime = CODEC_MIME_MAP[codec];
          if (!mime) continue; // Unknown codec — assume supported

          // Special DV detection: Jellyfin may report codec as "hevc" with DV profile
          const isDV = codec.includes('dvhe') || codec.includes('dvh1') ||
                       profile.includes('dolby vision');
          const effectiveMime = isDV ? 'video/dolby-vision' : mime;

          if (!deviceCodecs.includes(effectiveMime)) {
            console.log(`[DownloadStore] Unsupported codec: ${stream.Type} ${codec} (${effectiveMime}) — will transcode`);
            needsTranscode = true;
            break;
          }

          // MIME type supported — also check HEVC profile/level (e.g. Main 10 / Level 5.1
          // may exceed hardware decoder capabilities even if video/hevc is listed).
          if ((codec === 'hevc' || codec === 'h265') && stream.Type === 'Video') {
            const streamProfile = (stream.Profile || '') as string;
            const streamLevel = (stream.Level as number) || 0;
            if (streamProfile && streamLevel) {
              const { supported } = await NativeVideo.canDecodeHevc({ profile: streamProfile, level: streamLevel });
              if (!supported) {
                console.log(`[DownloadStore] HEVC profile "${streamProfile}" level ${streamLevel} not supported — will transcode`);
                needsTranscode = true;
                break;
              }
            }
          }
        }

        if (!needsTranscode) return undefined;

        // Request a transcoding URL from Jellyfin
        console.log(`[DownloadStore] Requesting transcoded download for ${itemId}`);
        const serverUrl = jellyfinStore.serverUrl!;
        const token = jellyfinStore.accessToken!;

        const response = await fetch(
          `${serverUrl}/Items/${itemId}/PlaybackInfo?userId=${jellyfinStore.userId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Emby-Token': token,
            },
            body: JSON.stringify({
              DeviceProfile: {
                DirectPlayProfiles: [],
                TranscodingProfiles: [
                  {
                    Container: 'mkv',
                    Type: 'Video',
                    VideoCodec: 'h264',
                    // Broad list — Jellyfin copies compatible tracks, transcodes the rest to aac
                    AudioCodec: 'aac,mp3,ac3,eac3,dts,flac,opus,pcm',
                    Context: 'Static',
                    Protocol: 'http',
                    CopyTimestamps: true,
                    MaxAudioChannels: '8',
                  },
                ],
                SubtitleProfiles: [
                  { Format: 'srt',    Method: 'Embed' },
                  { Format: 'subrip', Method: 'Embed' },
                  { Format: 'ass',    Method: 'Embed' },
                  { Format: 'ssa',    Method: 'Embed' },
                  { Format: 'pgs',    Method: 'Embed' },
                  { Format: 'pgssub', Method: 'Embed' },
                ],
                CodecProfiles: [],
              },
              MediaSourceId: itemId,
              AllowVideoStreamCopy: false,  // always re-encode video to h264
              AllowAudioStreamCopy: true,   // preserve original audio where possible
            }),
          }
        );

        if (!response.ok) return undefined;
        const result = await response.json();
        const ms = result.MediaSources?.[0];

        if (ms?.TranscodingUrl) {
          const url = `${serverUrl}${ms.TranscodingUrl}`;
          const estimatedSize = (ms.Bitrate && ms.RunTimeTicks)
            ? Math.ceil((ms.Bitrate / 8) * (ms.RunTimeTicks / 10_000_000))
            : 0;
          console.log(`[DownloadStore] Transcoded URL (est. ${Math.round(estimatedSize / 1024 / 1024)}MB): ${url.substring(0, 80)}...`);
          return { url, estimatedSize };
        }

        return undefined;
      } catch (e) {
        console.warn('[DownloadStore] Codec check failed, downloading raw:', e);
        return undefined;
      }
    },

    cancelDownload(itemId: string) {
      const task = this.tasks.get(itemId);
      if (!task) return;
      if (task.status === 'queued') {
        // Never started — just mark cancelled and remove from metadata queue
        task.status = 'cancelled';
        this._metadataQueue.delete(itemId);
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
        } else if (task.status === 'downloading') {
          downloadService.cancelDownload(task.itemId);
          task.status = 'cancelled';
        }
      }
    },

    removeTask(itemId: string) {
      this.tasks.delete(itemId);
      this._metadataQueue.delete(itemId);
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
