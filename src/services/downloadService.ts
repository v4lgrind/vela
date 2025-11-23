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
   * Télécharge un fichier depuis Jellyfin
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
