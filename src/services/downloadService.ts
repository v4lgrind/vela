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

class DownloadService {
  private downloads: Map<string, AbortController> = new Map();
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> =
    new Map();

  /**
   * Convert Uint8Array to base64 for Capacitor filesystem
   */
  private arrayBufferToBase64(buffer: Uint8Array): string {
    const CHUNK_SIZE = 0x8000; // 32KB chunks for large files
    let binary = '';
    for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
      const chunk = buffer.subarray(i, Math.min(i + CHUNK_SIZE, buffer.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
  }

  /**
   * Télécharge un fichier depuis Jellyfin (ancienne méthode - browser download)
   */
  async downloadFile(
    serverUrl: string,
    itemId: string,
    accessToken: string,
    filename: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    try {
      // Créer un AbortController pour pouvoir annuler
      const controller = new AbortController();
      this.downloads.set(itemId, controller);

      if (onProgress) {
        this.progressCallbacks.set(itemId, onProgress);
      }

      // URL de téléchargement Jellyfin
      const downloadUrl = `${serverUrl}/Items/${itemId}/Download?api_key=${accessToken}`;

      console.log("📥 Téléchargement:", filename);

      // Fetch avec signal pour pouvoir annuler
      const response = await fetch(downloadUrl, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get("Content-Length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      // Lire le stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Impossible de lire le stream");
      }

      const chunks: Uint8Array[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        chunks.push(value);
        loaded += value.length;

        // Callback de progression
        if (onProgress && total > 0) {
          const percentage = Math.round((loaded / total) * 100);
          onProgress({
            itemId,
            filename,
            loaded,
            total,
            percentage,
          });
        }
      }

      // Créer le blob
      const blob = new Blob(chunks);

      // Déclencher le téléchargement
      this.saveBlob(blob, filename);

      console.log("✅ Téléchargement terminé:", filename);

      // Nettoyer
      this.downloads.delete(itemId);
      this.progressCallbacks.delete(itemId);
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("🚫 Téléchargement annulé:", filename);
      } else {
        console.error("❌ Erreur téléchargement:", error);
        throw error;
      }

      this.downloads.delete(itemId);
      this.progressCallbacks.delete(itemId);
    }
  }

  /**
   * Yield to the main thread to keep UI responsive
   */
  private yieldToMain(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Télécharge un fichier pour usage hors ligne (nouvelle méthode)
   */
  async downloadForOffline(
    serverUrl: string,
    itemId: string,
    accessToken: string,
    metadata: any,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    const controller = new AbortController();
    this.downloads.set(itemId, controller);
    if (onProgress) this.progressCallbacks.set(itemId, onProgress);

    const extension = this.getFileExtension(metadata);
    const filename = this.sanitizeFilename(`${metadata.Name || itemId}.${extension}`);
    const filePath = this.buildFilePath(metadata, filename);
    const downloadUrl = `${serverUrl}/Items/${itemId}/Download?api_key=${accessToken}`;

    console.log("📥 Téléchargement offline:", filename);

    try {
      const response = await fetch(downloadUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const contentLength = response.headers.get("Content-Length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Impossible de lire le stream");

      // Batch network chunks into 8 MB writes to minimise Capacitor bridge
      // crossings and base64 encoding overhead. Larger batches = fewer
      // main-thread-blocking encoding operations.
      //
      // Base64 encodes 3 bytes per character, so every batch written must be
      // a multiple of 3 bytes — carry the ≤2 leftover bytes into the next batch.
      //
      // The first batch uses writeFile (recursive: true) so it creates the
      // full directory tree and the file in one operation. Subsequent batches
      // use appendFile.
      const WRITE_BATCH = 8 * 1024 * 1024; // 8 MB

      let loaded = 0;
      let isFirstWrite = true;
      let remainder = new Uint8Array(0); // ≤ 2 bytes pending 3-byte alignment
      let pendingChunks: Uint8Array[] = [];
      let pendingSize = 0;

      // Throttle progress updates to max once per 500ms
      let lastProgressTime = 0;
      const PROGRESS_THROTTLE = 500;

      const writeBatch = async (chunks: Uint8Array[]) => {
        const len = chunks.reduce((s, c) => s + c.length, 0);
        if (len === 0) return;
        const buf = new Uint8Array(len);
        let off = 0;
        for (const c of chunks) { buf.set(c, off); off += c.length; }

        // Yield before heavy base64 encoding
        await this.yieldToMain();
        const data = this.arrayBufferToBase64(buf);

        // Yield before filesystem write
        await this.yieldToMain();
        if (isFirstWrite) {
          isFirstWrite = false;
          await Filesystem.writeFile({ path: filePath, data, directory: Directory.Data, recursive: true });
        } else {
          await Filesystem.appendFile({ path: filePath, data, directory: Directory.Data });
        }

        // Yield after write to let UI catch up
        await this.yieldToMain();
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (remainder.length > 0) pendingChunks.push(remainder);
          await writeBatch(pendingChunks);
          break;
        }

        loaded += value.length;

        const combined = new Uint8Array(remainder.length + value.length);
        combined.set(remainder);
        combined.set(value, remainder.length);

        const alignedLen = Math.floor(combined.length / 3) * 3;
        if (alignedLen > 0) {
          pendingChunks.push(combined.subarray(0, alignedLen));
          pendingSize += alignedLen;
        }
        remainder = combined.subarray(alignedLen).slice();

        if (pendingSize >= WRITE_BATCH) {
          await writeBatch(pendingChunks);
          pendingChunks = [];
          pendingSize = 0;
        }

        // Throttled progress callback
        const now = Date.now();
        if (onProgress && total > 0 && now - lastProgressTime >= PROGRESS_THROTTLE) {
          lastProgressTime = now;
          onProgress({ itemId, filename, loaded, total, percentage: Math.round((loaded / total) * 100) });
        }
      }

      // Final progress update
      if (onProgress && total > 0) {
        onProgress({ itemId, filename, loaded, total, percentage: 100 });
      }

      console.log("💾 Fichier sauvegardé:", filePath);

      const downloadedMedia: DownloadedMedia = {
        itemId: metadata.Id,
        type: this.getMediaType(metadata.Type),
        name: metadata.Name || 'Unknown',
        filePath,
        fileSize: total || loaded,
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
      if (error.name === 'AbortError') {
        console.log("🚫 Téléchargement annulé:", metadata.Name);
        // Clean up any partial file left on disk.
        try { await Filesystem.deleteFile({ path: filePath, directory: Directory.Data }); } catch { /* ignore */ }
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
   * Obtenir le fichier local pour lecture
   */
  async getLocalFile(itemId: string): Promise<string | null> {
    try {
      const download = await offlineDatabase.getDownload(itemId);
      if (!download) {
        return null;
      }

      // Convertir le chemin Capacitor en URL utilisable
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

      // Supprimer le fichier physique
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

      // Supprimer de IndexedDB
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

    // Fallback basé sur le type
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
        return 'Movie'; // Fallback
    }
  }

  /**
   * Nettoyer le nom de fichier
   */
  private sanitizeFilename(filename: string): string {
    return filename.replace(/[/\\?%*:|"<>]/g, '-');
  }

  /**
   * Build the structured file path based on media type:
   *   Movies  → Jellyfin V4lgrind/Movies/{Title}/{file}
   *   Episode → Jellyfin V4lgrind/TV Shows/{Series}/Season {N}/{file}
   *   Audio   → Jellyfin V4lgrind/Music/{Artist}/{Album}/{file}
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
   * Sauvegarde le blob en déclenchant le téléchargement navigateur
   */
  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Annule un téléchargement en cours
   */
  cancelDownload(itemId: string): void {
    const controller = this.downloads.get(itemId);
    if (controller) {
      controller.abort();
      this.downloads.delete(itemId);
      this.progressCallbacks.delete(itemId);
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
