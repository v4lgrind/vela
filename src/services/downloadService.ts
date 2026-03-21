import { offlineDatabase, type DownloadedMedia } from './offlineDatabase';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

interface DownloadProgress {
  itemId: string;
  filename: string;
  loaded: number;
  total: number;
  percentage: number;
}

interface ActiveDownload {
  aborted: boolean;
  progressListener: PluginListenerHandle | null;
}

class DownloadService {
  private downloads: Map<string, ActiveDownload> = new Map();
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();
  /** Map download URLs to item IDs for progress event routing */
  private urlToItemId: Map<string, string> = new Map();

  /**
   * Download file for offline use.
   * Progress is tracked via Capacitor's built-in progress event, filtered by
   * download URL so concurrent downloads report independently.
   */
  async downloadForOffline(
    serverUrl: string,
    itemId: string,
    accessToken: string,
    metadata: any,
    onProgress?: (progress: DownloadProgress) => void,
    transcodedUrl?: string
  ): Promise<void> {
    if (this.downloads.has(itemId)) {
      console.log('Already downloading:', itemId);
      return;
    }

    // When transcoding, the server outputs an MP4/MKV container — use .mp4 extension
    const extension = transcodedUrl ? 'mp4' : this.getFileExtension(metadata);
    const filename = this.sanitizeFilename(`${metadata.Name || itemId}.${extension}`);
    const filePath = this.buildFilePath(metadata, filename);
    const downloadUrl = transcodedUrl || `${serverUrl}/Items/${itemId}/Download?api_key=${accessToken}`;

    if (transcodedUrl) {
      console.log('📥 Transcoded download:', filename);
    } else {
      console.log('📥 Native download:', filename);
    }

    if (onProgress) this.progressCallbacks.set(itemId, onProgress);

    const activeDownload: ActiveDownload = { aborted: false, progressListener: null };
    this.downloads.set(itemId, activeDownload);
    this.urlToItemId.set(downloadUrl, itemId);

    // Listen for Capacitor progress events.
    // URL matching is lenient: we check if the event URL contains our itemId
    // because Capacitor may encode/normalize URLs differently (especially transcoded ones).
    try {
      activeDownload.progressListener = await Filesystem.addListener('progress', (event) => {
        // Try exact match first, then check if event URL contains our download URL's path
        let matchedId = this.urlToItemId.get(event.url);
        if (!matchedId) {
          // Fallback: match by itemId in URL (covers encoding differences)
          for (const [url, id] of this.urlToItemId) {
            if (event.url?.includes(itemId) || url === event.url) {
              matchedId = id;
              break;
            }
          }
        }
        if (matchedId !== itemId) return;

        const callback = this.progressCallbacks.get(itemId);
        if (callback) {
          const loaded = event.bytes;
          const total = event.contentLength;
          // Transcoded streams use chunked transfer — no Content-Length.
          // Report loaded bytes with percentage = -1 so the UI can show indeterminate progress.
          const percentage = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : -1;
          callback({ itemId, filename, loaded, total, percentage });
        }
      });
    } catch { /* listener setup failed — progress just won't update */ }

    // For transcoded downloads, poll file size as a fallback since
    // Capacitor progress events may not fire for chunked responses.
    let sizePollInterval: ReturnType<typeof setInterval> | null = null;
    if (transcodedUrl && onProgress) {
      sizePollInterval = setInterval(async () => {
        try {
          const stat = await Filesystem.stat({ path: filePath, directory: Directory.Data });
          const size = stat.size ?? 0;
          if (size > 0) {
            const callback = this.progressCallbacks.get(itemId);
            if (callback) {
              callback({ itemId, filename, loaded: size, total: 0, percentage: -1 });
            }
          }
        } catch { /* file may not exist yet */ }
      }, 2000);
    }

    try {
      // Ensure directory exists
      const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
      try {
        await Filesystem.mkdir({ path: dirPath, directory: Directory.Data, recursive: true });
      } catch { /* may already exist */ }

      await Filesystem.downloadFile({
        url: downloadUrl,
        path: filePath,
        directory: Directory.Data,
        progress: true,
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

      await offlineDatabase.addDownload(downloadedMedia);
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
      if (sizePollInterval) clearInterval(sizePollInterval);
      if (activeDownload.progressListener) {
        await activeDownload.progressListener.remove();
        activeDownload.progressListener = null;
      }
      this.downloads.delete(itemId);
      this.progressCallbacks.delete(itemId);
      this.urlToItemId.delete(downloadUrl);
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
