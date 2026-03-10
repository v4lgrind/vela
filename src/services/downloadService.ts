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
}

class DownloadService {
  private downloads: Map<string, ActiveDownload> = new Map();
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();

  /**
   * Télécharge un fichier pour usage hors ligne using Web Worker
   */
  async downloadForOffline(
    serverUrl: string,
    itemId: string,
    accessToken: string,
    metadata: any,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    // Check if already downloading
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
            // Write chunk to filesystem (this is the only main-thread work)
            if (activeDownload.isFirstWrite) {
              activeDownload.isFirstWrite = false;
              await Filesystem.writeFile({
                path: filePath,
                data: msg.data,
                directory: Directory.Data,
                recursive: true,
              });
            } else {
              await Filesystem.appendFile({
                path: filePath,
                data: msg.data,
                directory: Directory.Data,
              });
            }
          } else if (msg.type === 'complete') {
            console.log("💾 Fichier sauvegardé:", filePath);

            const downloadedMedia: DownloadedMedia = {
              itemId: metadata.Id,
              type: this.getMediaType(metadata.Type),
              name: metadata.Name || 'Unknown',
              filePath,
              fileSize: msg.loaded,
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
              // Clean up partial file
              try {
                await Filesystem.deleteFile({ path: filePath, directory: Directory.Data });
              } catch { /* ignore */ }
            } else {
              console.error("❌ Erreur téléchargement offline:", msg.message);
            }
            this.cleanup(itemId);
            reject(error);
          }
        } catch (err) {
          console.error("❌ Error handling worker message:", err);
          this.cleanup(itemId);
          reject(err);
        }
      };

      worker.onerror = (error) => {
        console.error("❌ Worker error:", error);
        this.cleanup(itemId);
        reject(new Error('Worker error'));
      };

      // Start download in worker
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

  /**
   * Obtenir le fichier local pour lecture
   */
  async getLocalFile(itemId: string): Promise<string | null> {
    try {
      const download = await offlineDatabase.getDownload(itemId);
      if (!download) {
        return null;
      }

      const fileInfo = await Filesystem.getUri({
        path: download.filePath,
        directory: Directory.Data
      });
      const fileUrl = Capacitor.convertFileSrc(fileInfo.uri);
      return fileUrl;
    } catch (error) {
      console.error("❌ Erreur récupération fichier local:", error);
      return null;
    }
  }

  /**
   * Supprimer un fichier hors ligne
   */
  async deleteOfflineFile(itemId: string): Promise<void> {
    try {
      const download = await offlineDatabase.getDownload(itemId);
      if (!download) {
        console.warn("Fichier déjà supprimé ou inexistant:", itemId);
        return;
      }

      let fileExists = false;
      try {
        await Filesystem.stat({ path: download.filePath, directory: Directory.Data });
        fileExists = true;
      } catch {
        fileExists = false;
      }
      if (fileExists) {
        await Filesystem.deleteFile({
          path: download.filePath,
          directory: Directory.Data
        });
        console.log("🗑️ Fichier supprimé:", download.filePath);
      }

      await offlineDatabase.deleteDownload(itemId);
      console.log("✅ Téléchargement offline supprimé:", itemId);
    } catch (error) {
      console.error("❌ Erreur suppression fichier offline:", error);
      throw error;
    }
  }

  /**
   * Déterminer l'extension du fichier
   */
  private getFileExtension(metadata: any): string {
    if (metadata.Container) {
      return metadata.Container;
    }

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

  /**
   * Déterminer le type de média
   */
  private getMediaType(type: string): DownloadedMedia['type'] {
    switch (type) {
      case 'Movie':
        return 'Movie';
      case 'Episode':
        return 'Episode';
      case 'MusicAlbum':
        return 'MusicAlbum';
      case 'Audio':
        return 'Audio';
      default:
        return 'Movie';
    }
  }

  /**
   * Nettoyer le nom de fichier
   */
  private sanitizeFilename(filename: string): string {
    return filename.replace(/[/\\?%*:|"<>]/g, '-');
  }

  /**
   * Build the structured file path based on media type
   */
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
   * Annule un téléchargement en cours
   */
  cancelDownload(itemId: string): void {
    const download = this.downloads.get(itemId);
    if (download) {
      download.worker.postMessage({ type: 'cancel' });
      console.log("🚫 Téléchargement annulé:", itemId);
    }
  }

  /**
   * Vérifie si un téléchargement est en cours
   */
  isDownloading(itemId: string): boolean {
    return this.downloads.has(itemId);
  }

  /**
   * Obtient tous les téléchargements en cours
   */
  getActiveDownloads(): string[] {
    return Array.from(this.downloads.keys());
  }
}

export const downloadService = new DownloadService();
