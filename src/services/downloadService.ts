import { offlineDatabase, type DownloadedMedia } from './offlineDatabase';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Http } from '@capacitor-community/http';

interface DownloadProgress {
  itemId: string;
  filename: string;
  loaded: number;
  total: number;
  percentage: number;
}

interface ActiveDownload {
  aborted: boolean;
  filePath: string;
  metadata: any;
  filename: string;
}

class DownloadService {
  private downloads: Map<string, ActiveDownload> = new Map();
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();

  /**
   * Download file for offline use - uses native HTTP on Android, falls back to fetch on web
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

    console.log("📥 Téléchargement offline:", filename);

    if (onProgress) this.progressCallbacks.set(itemId, onProgress);

    const activeDownload: ActiveDownload = {
      aborted: false,
      filePath,
      metadata,
      filename,
    };
    this.downloads.set(itemId, activeDownload);

    try {
      if (Capacitor.isNativePlatform()) {
        await this.downloadNative(itemId, downloadUrl, filePath, filename, onProgress);
      } else {
        await this.downloadWeb(itemId, downloadUrl, filePath, filename, onProgress);
      }

      if (activeDownload.aborted) {
        throw new Error('AbortError');
      }

      console.log("💾 Fichier sauvegardé:", filePath);

      // Get actual file size
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
      console.log("✅ Téléchargement offline terminé:", filename);

    } catch (error: any) {
      if (error.message === 'AbortError' || activeDownload.aborted) {
        console.log("🚫 Téléchargement annulé:", metadata.Name);
        try {
          await Filesystem.deleteFile({ path: filePath, directory: Directory.Data });
        } catch { /* ignore */ }
        const err = new Error('AbortError');
        (err as any).name = 'AbortError';
        throw err;
      } else {
        console.error("❌ Erreur téléchargement offline:", error);
        throw error;
      }
    } finally {
      this.downloads.delete(itemId);
      this.progressCallbacks.delete(itemId);
    }
  }

  /**
   * Native download using Capacitor HTTP plugin - runs entirely in native code
   */
  private async downloadNative(
    itemId: string,
    url: string,
    filePath: string,
    filename: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    // Get the full native path for the file
    const fullPath = `${Directory.Data}/${filePath}`;

    // Ensure directory exists
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    try {
      await Filesystem.mkdir({
        path: dirPath,
        directory: Directory.Data,
        recursive: true,
      });
    } catch { /* directory may already exist */ }

    // Use native HTTP download - this happens entirely in native code
    // No WebView involvement = no UI jank
    const response = await Http.downloadFile({
      url,
      filePath: filePath,
      fileDirectory: Directory.Data,
      progress: true,
    });

    // Progress events are handled by the plugin internally
    // Final progress update
    if (onProgress && response.path) {
      try {
        const stat = await Filesystem.stat({ path: filePath, directory: Directory.Data });
        onProgress({
          itemId,
          filename,
          loaded: stat.size,
          total: stat.size,
          percentage: 100,
        });
      } catch { /* ignore */ }
    }
  }

  /**
   * Web fallback using fetch + streaming writes
   */
  private async downloadWeb(
    itemId: string,
    url: string,
    filePath: string,
    filename: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Cannot read response stream');

    const BATCH_SIZE = 2 * 1024 * 1024; // 2 MB
    let loaded = 0;
    let isFirstWrite = true;
    let pendingData: Uint8Array[] = [];
    let pendingSize = 0;
    let lastProgressTime = 0;

    const writeBatch = async (chunks: Uint8Array[]) => {
      const len = chunks.reduce((s, c) => s + c.length, 0);
      if (len === 0) return;

      const buf = new Uint8Array(len);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.length;
      }

      const data = this.arrayBufferToBase64(buf);

      if (isFirstWrite) {
        isFirstWrite = false;
        await Filesystem.writeFile({
          path: filePath,
          data,
          directory: Directory.Data,
          recursive: true,
        });
      } else {
        await Filesystem.appendFile({
          path: filePath,
          data,
          directory: Directory.Data,
        });
      }

      // Small delay to let UI breathe
      await new Promise(r => setTimeout(r, 10));
    };

    while (true) {
      const download = this.downloads.get(itemId);
      if (download?.aborted) break;

      const { done, value } = await reader.read();

      if (done) {
        await writeBatch(pendingData);
        break;
      }

      loaded += value.length;
      pendingData.push(value);
      pendingSize += value.length;

      if (pendingSize >= BATCH_SIZE) {
        await writeBatch(pendingData);
        pendingData = [];
        pendingSize = 0;
      }

      const now = Date.now();
      if (onProgress && total > 0 && now - lastProgressTime >= 500) {
        lastProgressTime = now;
        onProgress({
          itemId,
          filename,
          loaded,
          total,
          percentage: Math.round((loaded / total) * 100),
        });
      }
    }

    if (onProgress && total > 0) {
      onProgress({ itemId, filename, loaded, total, percentage: 100 });
    }
  }

  /**
   * Convert Uint8Array to base64
   */
  private arrayBufferToBase64(buffer: Uint8Array): string {
    const CHUNK_SIZE = 0x8000;
    let binary = '';
    for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
      const chunk = buffer.subarray(i, Math.min(i + CHUNK_SIZE, buffer.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
  }

  /**
   * Get local file for playback
   */
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
      console.error("❌ Erreur récupération fichier local:", error);
      return null;
    }
  }

  /**
   * Delete offline file
   */
  async deleteOfflineFile(itemId: string): Promise<void> {
    try {
      const download = await offlineDatabase.getDownload(itemId);
      if (!download) {
        console.warn("Fichier déjà supprimé ou inexistant:", itemId);
        return;
      }

      try {
        await Filesystem.stat({ path: download.filePath, directory: Directory.Data });
        await Filesystem.deleteFile({ path: download.filePath, directory: Directory.Data });
        console.log("🗑️ Fichier supprimé:", download.filePath);
      } catch { /* file doesn't exist */ }

      await offlineDatabase.deleteDownload(itemId);
      console.log("✅ Téléchargement offline supprimé:", itemId);
    } catch (error) {
      console.error("❌ Erreur suppression fichier offline:", error);
      throw error;
    }
  }

  private getFileExtension(metadata: any): string {
    if (metadata.Container) return metadata.Container;
    switch (metadata.Type) {
      case 'Movie':
      case 'Episode':
        return 'mkv';
      case 'Audio':
        return 'mp3';
      default:
        return 'bin';
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
      console.log("🚫 Téléchargement annulé:", itemId);
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
