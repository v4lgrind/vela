import { offlineDatabase, type DownloadedMedia } from './offlineDatabase';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

interface DownloadProgress {
  itemId: string;
  filename: string;
  loaded: number;
  total: number;
  percentage: number;
}

interface ActiveDownload {
  aborted: boolean;
  pollInterval: ReturnType<typeof setInterval> | null;
}

class DownloadService {
  private downloads: Map<string, ActiveDownload> = new Map();
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();

  /**
   * Download file for offline use.
   * Progress is tracked by polling the file size on disk every 500 ms — this avoids
   * the global Filesystem 'progress' event channel which cannot distinguish between
   * concurrent downloads and causes flickering when multiple run at once.
   */
  async downloadForOffline(
    serverUrl: string,
    itemId: string,
    accessToken: string,
    metadata: any,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    if (this.downloads.has(itemId)) {
      console.log('Already downloading:', itemId);
      return;
    }

    const extension = this.getFileExtension(metadata);
    const filename = this.sanitizeFilename(`${metadata.Name || itemId}.${extension}`);
    const filePath = this.buildFilePath(metadata, filename);
    const downloadUrl = `${serverUrl}/Items/${itemId}/Download?api_key=${accessToken}`;

    console.log('📥 Native download:', filename);

    if (onProgress) this.progressCallbacks.set(itemId, onProgress);

    const activeDownload: ActiveDownload = { aborted: false, pollInterval: null };
    this.downloads.set(itemId, activeDownload);

    // Fetch total size in background so we can show accurate percentage
    let totalBytes = 0;
    fetch(downloadUrl, { method: 'HEAD' })
      .then(r => {
        const cl = r.headers.get('content-length');
        if (cl) totalBytes = parseInt(cl, 10);
      })
      .catch(() => {});

    // Poll file size on disk every 500 ms — one interval per download, fully isolated
    activeDownload.pollInterval = setInterval(async () => {
      if (!this.downloads.has(itemId)) return;
      try {
        const stat = await Filesystem.stat({ path: filePath, directory: Directory.Data });
        const callback = this.progressCallbacks.get(itemId);
        if (callback) {
          const loaded = stat.size ?? 0;
          const total = totalBytes || 0;
          const percentage = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
          callback({ itemId, filename, loaded, total, percentage });
        }
      } catch { /* file not created yet — fine */ }
    }, 500);

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
        progress: false,
      });

      if (activeDownload.aborted) {
        throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
      }

      console.log('💾 Native download complete:', filePath);

      // Actual file size after completion
      let fileSize = totalBytes;
      try {
        const stat = await Filesystem.stat({ path: filePath, directory: Directory.Data });
        fileSize = stat.size ?? totalBytes;
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
      if (activeDownload.pollInterval !== null) {
        clearInterval(activeDownload.pollInterval);
        activeDownload.pollInterval = null;
      }
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
