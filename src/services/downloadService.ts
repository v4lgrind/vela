import { offlineDatabase, type DownloadedMedia } from './offlineDatabase';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import DownloadWorker from '@/workers/downloadWorker?worker';

interface DownloadProgress {
  itemId: string;
  filename: string;
  loaded: number;
  total: number;
  percentage: number;
}

interface ActiveDownload {
  worker: Worker;
  filePath: string;
  metadata: any;
  filename: string;
  isFirstWrite: boolean;
  loaded: number;
  writeQueue: string[];
  isWriting: boolean;
  isPaused: boolean;
}

class DownloadService {
  private downloads: Map<string, ActiveDownload> = new Map();
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();

  /**
   * Process write queue with delays between writes to keep UI responsive
   */
  private async processWriteQueue(itemId: string): Promise<void> {
    const download = this.downloads.get(itemId);
    if (!download || download.isWriting || download.writeQueue.length === 0) return;

    download.isWriting = true;
    const data = download.writeQueue.shift()!;

    try {
      if (download.isFirstWrite) {
        download.isFirstWrite = false;
        await Filesystem.writeFile({
          path: download.filePath,
          data,
          directory: Directory.Data,
          recursive: true,
        });
      } else {
        await Filesystem.appendFile({
          path: download.filePath,
          data,
          directory: Directory.Data,
        });
      }
    } catch (err) {
      console.error('Write error:', err);
    }

    download.isWriting = false;

    // Schedule next write with a delay to let UI breathe
    if (download.writeQueue.length > 0) {
      setTimeout(() => this.processWriteQueue(itemId), 50);
    }
  }

  /**
   * Download file for offline use using Web Worker
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

    return new Promise((resolve, reject) => {
      const worker = new DownloadWorker();

      const activeDownload: ActiveDownload = {
        worker,
        filePath,
        metadata,
        filename,
        isFirstWrite: true,
        loaded: 0,
        writeQueue: [],
        isWriting: false,
        isPaused: false,
      };

      this.downloads.set(itemId, activeDownload);

      worker.onmessage = async (event) => {
        const msg = event.data;

        try {
          if (msg.type === 'progress') {
            activeDownload.loaded = msg.loaded;
            const callback = this.progressCallbacks.get(itemId);
            if (callback) {
              callback({
                itemId,
                filename,
                loaded: msg.loaded,
                total: msg.total,
                percentage: msg.percentage,
              });
            }
          } else if (msg.type === 'chunk') {
            // Queue chunk for writing
            activeDownload.writeQueue.push(msg.data);
            // Start processing if not already
            if (!activeDownload.isWriting) {
              this.processWriteQueue(itemId);
            }
          } else if (msg.type === 'complete') {
            // Wait for all writes to complete
            while (activeDownload.writeQueue.length > 0 || activeDownload.isWriting) {
              await new Promise(r => setTimeout(r, 100));
            }

            console.log("💾 Fichier sauvegardé:", filePath);

            // Get file size
            let fileSize = msg.loaded;
            try {
              const stat = await Filesystem.stat({ path: filePath, directory: Directory.Data });
              fileSize = stat.size;
            } catch { /* use loaded */ }

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

            this.cleanup(itemId);
            resolve();
          } else if (msg.type === 'error') {
            const error = new Error(msg.message);
            if (msg.message === 'AbortError') {
              (error as any).name = 'AbortError';
              console.log("🚫 Téléchargement annulé:", metadata.Name);
              try {
                await Filesystem.deleteFile({ path: filePath, directory: Directory.Data });
              } catch { /* ignore */ }
            } else {
              console.error("❌ Erreur téléchargement:", msg.message);
            }
            this.cleanup(itemId);
            reject(error);
          }
        } catch (err) {
          console.error("❌ Error handling message:", err);
          this.cleanup(itemId);
          reject(err);
        }
      };

      worker.onerror = (error) => {
        console.error("❌ Worker error:", error);
        this.cleanup(itemId);
        reject(new Error('Worker error'));
      };

      worker.postMessage({ type: 'start', url: downloadUrl, itemId });
    });
  }

  private cleanup(itemId: string) {
    const download = this.downloads.get(itemId);
    if (download) {
      download.worker.terminate();
    }
    this.downloads.delete(itemId);
    this.progressCallbacks.delete(itemId);
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
      console.error("❌ Erreur récupération fichier local:", error);
      return null;
    }
  }

  async deleteOfflineFile(itemId: string): Promise<void> {
    try {
      const download = await offlineDatabase.getDownload(itemId);
      if (!download) {
        console.warn("Fichier déjà supprimé:", itemId);
        return;
      }

      try {
        await Filesystem.stat({ path: download.filePath, directory: Directory.Data });
        await Filesystem.deleteFile({ path: download.filePath, directory: Directory.Data });
        console.log("🗑️ Fichier supprimé:", download.filePath);
      } catch { /* file doesn't exist */ }

      await offlineDatabase.deleteDownload(itemId);
      console.log("✅ Téléchargement supprimé:", itemId);
    } catch (error) {
      console.error("❌ Erreur suppression:", error);
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
      download.worker.postMessage({ type: 'cancel' });
      console.log("🚫 Annulation:", itemId);
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
