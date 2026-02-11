import { offlineDatabase, type DownloadedMedia } from './offlineDatabase';
import { writeFile, BaseDirectory, exists, remove } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';

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
   * Télécharge un fichier pour usage hors ligne (nouvelle méthode)
   */
  async downloadForOffline(
    serverUrl: string,
    itemId: string,
    accessToken: string,
    metadata: any,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    try {
      // Créer un AbortController pour pouvoir annuler
      const controller = new AbortController();
      this.downloads.set(itemId, controller);

      if (onProgress) {
        this.progressCallbacks.set(itemId, onProgress);
      }

      // Déterminer l'extension du fichier
      const extension = this.getFileExtension(metadata);
      const filename = this.sanitizeFilename(`${metadata.Name || itemId}.${extension}`);

      // URL de téléchargement Jellyfin
      const downloadUrl = `${serverUrl}/Items/${itemId}/Download?api_key=${accessToken}`;

      console.log("📥 Téléchargement offline:", filename);

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

      // Créer le buffer
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const buffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }

      // Sauvegarder via Tauri
      const filePath = `downloads/${filename}`;
      await writeFile(filePath, buffer, { baseDir: BaseDirectory.AppData });

      console.log("💾 Fichier sauvegardé:", filePath);

      // Créer l'objet DownloadedMedia
      const downloadedMedia: DownloadedMedia = {
        itemId: metadata.Id,
        type: this.getMediaType(metadata.Type),
        name: metadata.Name || 'Unknown',
        filePath: filePath,
        fileSize: total,
        downloadDate: Date.now(),
        jellyfinItem: metadata,
      };

      // Ajouter les métadonnées spécifiques selon le type
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

      // Sauvegarder dans IndexedDB
      await offlineDatabase.addDownload(downloadedMedia);

      console.log("✅ Téléchargement offline terminé:", filename);

      // Nettoyer
      this.downloads.delete(itemId);
      this.progressCallbacks.delete(itemId);
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("🚫 Téléchargement annulé:", metadata.Name);
      } else {
        console.error("❌ Erreur téléchargement offline:", error);
        throw error;
      }

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

      // Convertir le chemin Tauri en URL utilisable
      const fileUrl = convertFileSrc(download.filePath, 'appdata');
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
      const fileExists = await exists(download.filePath, { baseDir: BaseDirectory.AppData });
      if (fileExists) {
        await remove(download.filePath, { baseDir: BaseDirectory.AppData });
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
