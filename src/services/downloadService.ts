import { offlineDatabase, type DownloadedMedia } from './offlineDatabase';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { DownloadPlugin } from '@/plugins/DownloadPlugin';

interface DownloadProgress {
  itemId: string;
  filename: string;
  loaded: number;
  total: number;
  percentage: number;
}

interface ActiveDownload {
  aborted: boolean;
}

class DownloadService {
  private downloads: Map<string, ActiveDownload> = new Map();
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();

  /**
   * Download file for offline use via native Android ForegroundService.
   * The download survives app backgrounding, screen-off, and retries on network errors.
   */
  async downloadForOffline(
    serverUrl: string,
    itemId: string,
    accessToken: string,
    metadata: any,
    onProgress?: (progress: DownloadProgress) => void,
    transcodedUrl?: string,
    estimatedSize?: number,
  ): Promise<void> {
    if (this.downloads.has(itemId)) {
      throw new Error(`Download already in progress for ${itemId}`);
    }

    // When transcoding, the server outputs an MKV container (multi-track + subtitle support)
    const extension = transcodedUrl ? 'mkv' : this.getFileExtension(metadata);
    const filename = this.sanitizeFilename(`${metadata.Name || itemId}.${extension}`);
    const filePath = this.buildFilePath(metadata, filename);
    const downloadUrl = transcodedUrl || `${serverUrl}/Items/${itemId}/Download?api_key=${accessToken}`;

    if (transcodedUrl) {
      console.log('📥 Transcoded download:', filename);
    } else {
      console.log('📥 Native download:', filename);
    }

    if (onProgress) this.progressCallbacks.set(itemId, onProgress);

    const activeDownload: ActiveDownload = { aborted: false };
    this.downloads.set(itemId, activeDownload);

    try {
      // Download via native Android ForegroundService (keeps CPU awake, shows notification)
      await new Promise<void>((resolve, reject) => {
        const handles: PluginListenerHandle[] = [];

        const cleanup = async () => {
          for (const h of handles) {
            try { await h.remove(); } catch { /* ignore */ }
          }
        };

        (async () => {
          handles.push(await DownloadPlugin.addListener('downloadProgress', (evt) => {
            if (evt.itemId !== itemId) return;
            if (activeDownload.aborted) {
              DownloadPlugin.cancel({ itemId }).catch(() => {});
              return;
            }
            const callback = this.progressCallbacks.get(itemId);
            if (callback) {
              const total = evt.total > 0 ? evt.total : (estimatedSize || 0);
              const pct = total > 0 ? Math.min(99, Math.round((evt.loaded / total) * 100)) : -1;
              callback({ itemId, filename, loaded: evt.loaded, total, percentage: pct });
            }
          }));

          handles.push(await DownloadPlugin.addListener('downloadComplete', async (evt) => {
            if (evt.itemId !== itemId) return;
            await cleanup();
            resolve();
          }));

          handles.push(await DownloadPlugin.addListener('downloadFailed', async (evt) => {
            if (evt.itemId !== itemId) return;
            await cleanup();
            if (activeDownload.aborted || evt.error === 'AbortError') {
              reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
            } else {
              reject(new Error(evt.error));
            }
          }));

          // Persist metadata so offline-store can reconstruct the DB record if the
          // app is killed after the native download completes but before this JS
          // completion logic runs.
          localStorage.setItem(`dl_meta_${itemId}`, JSON.stringify({ metadata, filePath }));

          await DownloadPlugin.enqueue({
            itemId,
            url: downloadUrl,
            destPath: filePath,
            itemName: metadata.Name || '',
            estimatedSize: estimatedSize || 0,
          });
        })().catch(reject);
      });

      if (activeDownload.aborted) {
        throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
      }

      console.log('💾 Native download complete:', filePath);

      // Actual file size after completion
      let fileSize = 0;
      try {
        const stat = await Filesystem.stat({ path: filePath, directory: Directory.Data });
        fileSize = stat.size ?? 0;
      } catch { /* ignore */ }

      const downloadedMedia: DownloadedMedia = {
        itemId: metadata.Id,
        type: this.getMediaType(metadata.Type),
        name: metadata.Name || 'Unknown',
        filePath,
        fileSize,
        downloadDate: Date.now(),
        jellyfinItem: metadata,
      };

      if (metadata.Type === 'Episode') {
        downloadedMedia.seriesId = metadata.SeriesId;
        downloadedMedia.seriesName = metadata.SeriesName;
        downloadedMedia.seasonId = metadata.SeasonId;
        downloadedMedia.seasonNumber = metadata.ParentIndexNumber;
        downloadedMedia.episodeNumber = metadata.IndexNumber;
      } else if (metadata.Type === 'Audio') {
        downloadedMedia.albumId = metadata.AlbumId;
        downloadedMedia.albumName = metadata.Album;
      }

      // Fetch intro/outro segment timestamps so skip-intro works offline
      try {
        const segRes = await fetch(
          `${serverUrl}/MediaSegments/${itemId}?includeSegmentTypes=Intro&includeSegmentTypes=Outro&api_key=${accessToken}`
        );
        if (segRes.ok) {
          const segData = await segRes.json();
          if (segData.Items?.length) {
            downloadedMedia.introSegments = segData.Items.map((s: any) => ({
              Type: s.Type,
              StartTicks: s.StartTicks,
              EndTicks: s.EndTicks,
            }));
          }
        }
      } catch { /* non-critical — skip intro just won't work offline for this item */ }

      await offlineDatabase.addDownload(downloadedMedia);
      localStorage.removeItem(`dl_meta_${itemId}`);
      console.log('✅ Download complete:', filename);

      // Cache artwork images for offline display (fire-and-forget, don't block)
      this.cacheArtwork(serverUrl, accessToken, metadata).catch(() => {});

      // Final 100% callback
      const callback = this.progressCallbacks.get(itemId);
      if (callback) callback({ itemId, filename, loaded: fileSize, total: fileSize, percentage: 100 });

    } catch (error: any) {
      if (error.name === 'AbortError' || activeDownload.aborted) {
        console.log('🚫 Download cancelled:', metadata.Name);
        try { await Filesystem.deleteFile({ path: filePath, directory: Directory.Data }); } catch { /* ignore */ }
        const err = Object.assign(new Error('AbortError'), { name: 'AbortError' });
        throw err;
      }
      console.error('❌ Download error:', error);
      throw error;
    } finally {
      this.downloads.delete(itemId);
      this.progressCallbacks.delete(itemId);
    }
  }

  async getLocalFile(itemId: string): Promise<string | null> {
    try {
      const download = await offlineDatabase.getDownload(itemId);
      if (!download) return null;
      const fileInfo = await Filesystem.getUri({ path: download.filePath, directory: Directory.Data });
      return Capacitor.convertFileSrc(fileInfo.uri);
    } catch (error) {
      console.error('❌ Error getting local file:', error);
      return null;
    }
  }

  async deleteOfflineFile(itemId: string): Promise<void> {
    try {
      const download = await offlineDatabase.getDownload(itemId);
      if (!download) { console.warn('File already deleted:', itemId); return; }
      try {
        await Filesystem.stat({ path: download.filePath, directory: Directory.Data });
        await Filesystem.deleteFile({ path: download.filePath, directory: Directory.Data });
        console.log('🗑️ File deleted:', download.filePath);
      } catch { /* file doesn't exist */ }
      await offlineDatabase.deleteDownload(itemId);
      console.log('✅ Download removed:', itemId);
    } catch (error) {
      console.error('❌ Delete error:', error);
      throw error;
    }
  }

  private getFileExtension(metadata: any): string {
    if (metadata.Container) return metadata.Container;
    switch (metadata.Type) {
      case 'Movie':
      case 'Episode': return 'mkv';
      case 'Audio': return 'mp3';
      default: return 'bin';
    }
  }

  private getMediaType(type: string): DownloadedMedia['type'] {
    switch (type) {
      case 'Movie': return 'Movie';
      case 'Episode': return 'Episode';
      case 'MusicAlbum': return 'MusicAlbum';
      case 'Audio': return 'Audio';
      default: return 'Movie';
    }
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[/\\?%*:|"<>]/g, '-');
  }

  private buildFilePath(metadata: any, filename: string): string {
    const s = (v: string | undefined | null, fallback: string) =>
      this.sanitizeFilename(v || fallback);
    const root = 'Jellyfin V4lgrind';
    switch (metadata.Type) {
      case 'Movie':
        return `${root}/Movies/${s(metadata.Name, 'Unknown')}/${filename}`;
      case 'Episode': {
        const series = s(metadata.SeriesName, 'Unknown Series');
        const season = `Season ${metadata.ParentIndexNumber ?? 1}`;
        return `${root}/TV Shows/${series}/${season}/${filename}`;
      }
      case 'Audio': {
        const artist = s(metadata.AlbumArtist ?? metadata.Artists?.[0], 'Unknown Artist');
        const album = s(metadata.Album, 'Unknown Album');
        return `${root}/Music/${artist}/${album}/${filename}`;
      }
      default:
        return `${root}/${filename}`;
    }
  }

  /**
   * Download artwork images for offline display.
   * Caches the primary image for the item, plus series/season images for episodes.
   */
  private async cacheArtwork(serverUrl: string, accessToken: string, metadata: any): Promise<void> {
    const imageIds: string[] = [metadata.Id];

    // For episodes, also cache series and season artwork
    if (metadata.Type === 'Episode') {
      if (metadata.SeriesId) imageIds.push(metadata.SeriesId);
      if (metadata.SeasonId) imageIds.push(metadata.SeasonId);
    }

    for (const id of imageIds) {
      const imgPath = `Jellyfin V4lgrind/Images/${id}_Primary.jpg`;
      try {
        // Skip if already cached
        await Filesystem.stat({ path: imgPath, directory: Directory.Data });
        continue;
      } catch { /* not cached yet */ }

      const imgUrl = `${serverUrl}/Items/${id}/Images/Primary?maxWidth=400&quality=80&api_key=${accessToken}`;
      try {
        const dirPath = imgPath.substring(0, imgPath.lastIndexOf('/'));
        try {
          await Filesystem.mkdir({ path: dirPath, directory: Directory.Data, recursive: true });
        } catch { /* may exist */ }

        await Filesystem.downloadFile({
          url: imgUrl,
          path: imgPath,
          directory: Directory.Data,
          progress: false,
        });
      } catch {
        // Non-critical — artwork just won't be available offline
      }
    }
  }

  /**
   * Get a WebView-accessible URL for a cached artwork image.
   * Returns null if the image is not cached locally.
   */
  async getCachedImageUrl(itemId: string): Promise<string | null> {
    const imgPath = `Jellyfin V4lgrind/Images/${itemId}_Primary.jpg`;
    try {
      const fileInfo = await Filesystem.getUri({ path: imgPath, directory: Directory.Data });
      return Capacitor.convertFileSrc(fileInfo.uri);
    } catch {
      return null;
    }
  }

  /**
   * Cache a single artwork image by item ID. Used to backfill artwork for
   * downloads that were created before artwork caching was added.
   */
  async cacheArtworkById(serverUrl: string, accessToken: string, itemId: string): Promise<void> {
    const imgPath = `Jellyfin V4lgrind/Images/${itemId}_Primary.jpg`;
    try {
      // Skip if already cached
      await Filesystem.stat({ path: imgPath, directory: Directory.Data });
      return;
    } catch { /* not cached yet */ }

    const imgUrl = `${serverUrl}/Items/${itemId}/Images/Primary?maxWidth=400&quality=80&api_key=${accessToken}`;
    try {
      const dirPath = imgPath.substring(0, imgPath.lastIndexOf('/'));
      try {
        await Filesystem.mkdir({ path: dirPath, directory: Directory.Data, recursive: true });
      } catch { /* may exist */ }

      await Filesystem.downloadFile({
        url: imgUrl,
        path: imgPath,
        directory: Directory.Data,
        progress: false,
      });
    } catch { /* non-critical */ }
  }

  cancelDownload(itemId: string): void {
    const download = this.downloads.get(itemId);
    if (download) {
      download.aborted = true;
      DownloadPlugin.cancel({ itemId }).catch(() => {});
      console.log('🚫 Cancelling:', itemId);
    }
  }

  isDownloading(itemId: string): boolean {
    return this.downloads.has(itemId);
  }

  getActiveDownloads(): string[] {
    return Array.from(this.downloads.keys());
  }
}

export const downloadService = new DownloadService();
