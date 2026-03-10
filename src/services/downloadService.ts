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
}

class DownloadService {
  private downloads: Map<string, ActiveDownload> = new Map();
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();

  /**
   * Download file for offline use - uses native Filesystem.downloadFile
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

    console.log("📥 Native download:", filename);

    if (onProgress) this.progressCallbacks.set(itemId, onProgress);

    const activeDownload: ActiveDownload = { aborted: false };
    this.downloads.set(itemId, activeDownload);

    try {
      // Ensure directory exists
      const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
      try {
        await Filesystem.mkdir({
          path: dirPath,
          directory: Directory.Data,
          recursive: true,
        });
      } catch { /* directory may exist */ }

      // Use native downloadFile - runs entirely in native code!
      const result = await Filesystem.downloadFile({
        url: downloadUrl,
        path: filePath,
        directory: Directory.Data,
        progress: true,
      }, (progress) => {
        // Native progress callback
        const callback = this.progressCallbacks.get(itemId);
        if (callback && progress.contentLength > 0) {
          callback({
            itemId,
            filename,
            loaded: progress.bytes,
            total: progress.contentLength,
            percentage: Math.round((progress.bytes / progress.contentLength) * 100),
          });
        }
      });

      if (activeDownload.aborted) {
        throw new Error('AbortError');
      }

      console.log("💾 Native download complete:", filePath);

      // Get file size
      let fileSize = 0;
      try {
        const stat = await Filesystem.stat({ path: filePath, directory: Directory.Data });
        fileSize = stat.size;
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
      console.log("✅ Download complete:", filename);

      // Final progress
      const callback = this.progressCallbacks.get(itemId);
      if (callback) {
        callback({ itemId, filename, loaded: fileSize, total: fileSize, percentage: 100 });
      }

    } catch (error: any) {
      if (error.message === 'AbortError' || activeDownload.aborted) {
        console.log("🚫 Download cancelled:", metadata.Name);
        try {
          await Filesystem.deleteFile({ path: filePath, directory: Directory.Data });
        } catch { /* ignore */ }
        const err = new Error('AbortError');
        (err as any).name = 'AbortError';
        throw err;
      } else {
        console.error("❌ Download error:", error);
        throw error;
      }
    } finally {
      this.downloads.delete(itemId);
      this.progressCallbacks.delete(itemId);
    }
  }

  async getLocalFile(itemId: string): Promise<string | null> {
    try {
      const download = await offlineDatabase.getDownload(itemId);
      if (!download) return null;

      const fileInfo = await Filesystem.getUri({
        path: download.filePath,
        directory: Directory.Data,
      });
      return Capacitor.convertFileSrc(fileInfo.uri);
    } catch (error) {
      console.error("❌ Error getting local file:", error);
      return null;
    }
  }

  async deleteOfflineFile(itemId: string): Promise<void> {
    try {
      const download = await offlineDatabase.getDownload(itemId);
      if (!download) {
        console.warn("File already deleted:", itemId);
        return;
      }

      try {
        await Filesystem.stat({ path: download.filePath, directory: Directory.Data });
        await Filesystem.deleteFile({ path: download.filePath, directory: Directory.Data });
        console.log("🗑️ File deleted:", download.filePath);
      } catch { /* file doesn't exist */ }

      await offlineDatabase.deleteDownload(itemId);
      console.log("✅ Download removed:", itemId);
    } catch (error) {
      console.error("❌ Delete error:", error);
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

  cancelDownload(itemId: string): void {
    const download = this.downloads.get(itemId);
    if (download) {
      download.aborted = true;
      // Note: Filesystem.downloadFile doesn't support cancellation yet
      // The download will complete but we'll delete the file
      console.log("🚫 Cancelling:", itemId);
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
