import { buildDownloadedMedia, offlineDatabase, type DownloadedMedia } from './offlineDatabase';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

import { usePlatform } from '@/composables/usePlatform';
import { DownloadPlugin } from '@/plugins/DownloadPlugin';
import { getPrimaryContainer } from '@/utils/desktopCodec';
import { logger } from '@/utils/logger';

import {
  cancelDesktopMediaDownload,
  deleteDesktopMedia,
  downloadDesktopMedia,
  getDesktopMediaUrl,
  statDesktopMedia,
} from './desktopMedia';

const { isDesktop } = usePlatform();

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
    subtitleInfo?: { streamIndex: number; label: string; language: string },
    transcodedContainer?: string,
  ): Promise<void> {
    if (this.downloads.has(itemId)) {
      throw new Error(`Download already in progress for ${itemId}`);
    }

    // Android uses TS; desktop uses MP4 for Chromium-compatible offline playback.
    const extension = transcodedUrl
      ? (transcodedContainer || 'ts')
      : this.getFileExtension(metadata);
    const filename = this.sanitizeFilename(`${metadata.Name || itemId}.${extension}`);
    const filePath = this.buildFilePath(metadata, filename);
    const downloadUrl = transcodedUrl || `${serverUrl}/Items/${itemId}/Download`;
    const authHeaders = { 'X-Emby-Token': accessToken };

    if (transcodedUrl) {
      logger.log('📥 Transcoded download:', filename);
    } else {
      logger.log('📥 Native download:', filename);
    }

    if (onProgress) this.progressCallbacks.set(itemId, onProgress);

    const activeDownload: ActiveDownload = { aborted: false };
    this.downloads.set(itemId, activeDownload);

    try {
      if (isDesktop) {
        await downloadDesktopMedia({
          estimatedSize,
          headers: authHeaders,
          operationId: itemId,
          relativePath: filePath,
          url: downloadUrl,
          onProgress: (progress) => {
            const callback = this.progressCallbacks.get(itemId);
            if (!callback) return;
            callback({
              filename,
              itemId,
              loaded: progress.loaded,
              percentage: progress.percentage,
              total: progress.total,
            });
          },
        });
      } else {
        // Android ForegroundService keeps downloads alive while the app is backgrounded.
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

            // Persist metadata so offline-store can reconcile a completed native download.
            localStorage.setItem(`dl_meta_${itemId}`, JSON.stringify({ metadata, filePath }));

            await DownloadPlugin.enqueue({
              destPath: filePath,
              estimatedSize: estimatedSize || 0,
              headers: authHeaders,
              itemId,
              itemName: metadata.Name || '',
              url: downloadUrl,
            });
          })().catch(reject);
        });
      }

      if (activeDownload.aborted) {
        throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
      }

      logger.log('💾 Download complete:', filePath);

      // Actual file size after completion
      let fileSize = 0;
      try {
        const stat = await this.statFile(filePath);
        fileSize = stat.size ?? 0;
      } catch { /* ignore */ }

      const downloadedMedia: DownloadedMedia = buildDownloadedMedia(metadata, filePath, fileSize);

      // Download sidecar subtitle file for transcoded downloads
      if (subtitleInfo && subtitleInfo.streamIndex >= 0) {
        try {
          const subPath = filePath.replace(/\.[^.]+$/, '.srt');
          const subUrl = `${serverUrl}/Videos/${itemId}/${itemId}/Subtitles/${subtitleInfo.streamIndex}/Stream.srt`;
          logger.log('📝 Downloading subtitle:', subPath);
          await this.downloadFile(`subtitle-${itemId}`, subUrl, subPath, authHeaders);
          downloadedMedia.subtitleFilePath = subPath;
          downloadedMedia.subtitleLabel = subtitleInfo.label;
          downloadedMedia.subtitleLanguage = subtitleInfo.language;
          logger.log('✅ Subtitle downloaded:', subPath);
        } catch (e) {
          logger.warn('⚠️ Subtitle download failed (non-critical):', e);
        }
      }

      // Fetch intro/outro segment timestamps so skip-intro works offline
      try {
        const segRes = await fetch(
          `${serverUrl}/MediaSegments/${itemId}?includeSegmentTypes=Intro&includeSegmentTypes=Outro`,
          { headers: authHeaders }
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
      logger.log('✅ Download complete:', filename);

      // Cache artwork images for offline display (fire-and-forget, don't block)
      this.cacheArtwork(serverUrl, accessToken, metadata).catch(() => {});

      // Final 100% callback
      const callback = this.progressCallbacks.get(itemId);
      if (callback) callback({ itemId, filename, loaded: fileSize, total: fileSize, percentage: 100 });

    } catch (error: any) {
      if (error.name === 'AbortError' || activeDownload.aborted) {
        logger.log('🚫 Download cancelled:', metadata.Name);
        try { await this.deleteFile(filePath); } catch { /* ignore */ }
        const err = Object.assign(new Error('AbortError'), { name: 'AbortError' });
        throw err;
      }
      logger.error('❌ Download error:', error);
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
      await this.statFile(download.filePath);
      return this.getFileUrl(download.filePath);
    } catch (error) {
      logger.error('❌ Error getting local file:', error);
      return null;
    }
  }

  async deleteOfflineFile(itemId: string): Promise<void> {
    try {
      const download = await offlineDatabase.getDownload(itemId);
      if (!download) { logger.warn('File already deleted:', itemId); return; }
      try {
        await this.statFile(download.filePath);
        await this.deleteFile(download.filePath);
        logger.log('🗑️ File deleted:', download.filePath);
      } catch { /* file doesn't exist */ }
      // Also delete sidecar subtitle file if present
      if (download.subtitleFilePath) {
        try {
          await this.deleteFile(download.subtitleFilePath);
        } catch { /* ignore */ }
      }
      await offlineDatabase.deleteDownload(itemId);
      logger.log('✅ Download removed:', itemId);
    } catch (error) {
      logger.error('❌ Delete error:', error);
      throw error;
    }
  }

  private async statFile(filePath: string): Promise<{ size: number }> {
    if (isDesktop) {
      const result = await statDesktopMedia(filePath);
      if (!result.exists) throw new Error(`Media file not found: ${filePath}`);
      return { size: result.size };
    }

    const result = await Filesystem.stat({ path: filePath, directory: Directory.Data });
    return { size: result.size ?? 0 };
  }

  private async deleteFile(filePath: string): Promise<void> {
    if (isDesktop) {
      await deleteDesktopMedia(filePath);
      return;
    }
    await Filesystem.deleteFile({ path: filePath, directory: Directory.Data });
  }

  private async ensureDirectory(directoryPath: string): Promise<void> {
    if (isDesktop) return;
    await Filesystem.mkdir({
      directory: Directory.Data,
      path: directoryPath,
      recursive: true,
    });
  }

  private async downloadFile(
    operationId: string,
    url: string,
    filePath: string,
    headers: Record<string, string>,
  ): Promise<void> {
    if (isDesktop) {
      await downloadDesktopMedia({
        headers,
        operationId,
        relativePath: filePath,
        url,
      });
      return;
    }

    await Filesystem.downloadFile({
      directory: Directory.Data,
      headers,
      path: filePath,
      progress: false,
      url,
    });
  }

  private async getFileUrl(filePath: string): Promise<string> {
    if (isDesktop) return getDesktopMediaUrl(filePath);
    const fileInfo = await Filesystem.getUri({ path: filePath, directory: Directory.Data });
    return Capacitor.convertFileSrc(fileInfo.uri);
  }

  private getFileExtension(metadata: any): string {
    // Normalized single container — the raw item-level Container can be an
    // ffprobe CSV like "mov,mp4,m4a,3gp,3g2,mj2", which is no file extension.
    const container = getPrimaryContainer(metadata);
    if (container) return container;
    switch (metadata.Type) {
      case 'Movie':
      case 'Episode': return 'mkv';
      case 'Audio': return 'mp3';
      default: return 'bin';
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
      await this.cacheArtworkById(serverUrl, accessToken, id);
    }
  }

  /**
   * Get a WebView-accessible URL for a cached artwork image.
   * Returns null if the image is not cached locally.
   */
  async getCachedImageUrl(itemId: string): Promise<string | null> {
    const imgPath = `Jellyfin V4lgrind/Images/${itemId}_Primary.jpg`;
    try {
      await this.statFile(imgPath);
      return await this.getFileUrl(imgPath);
    } catch {
      return null;
    }
  }

  /**
   * Cache a single artwork image by item ID (skips if already cached).
   * Also exposed publicly to backfill artwork for downloads created before
   * artwork caching was added.
   */
  async cacheArtworkById(serverUrl: string, accessToken: string, itemId: string): Promise<void> {
    const imgPath = `Jellyfin V4lgrind/Images/${itemId}_Primary.jpg`;
    try {
      // Skip if already cached
      await this.statFile(imgPath);
      return;
    } catch { /* not cached yet */ }

    const imgUrl = `${serverUrl}/Items/${itemId}/Images/Primary?maxWidth=400&quality=80`;
    try {
      const dirPath = imgPath.substring(0, imgPath.lastIndexOf('/'));
      try {
        await this.ensureDirectory(dirPath);
      } catch { /* may exist */ }

      await this.downloadFile(
        `artwork-${itemId}`,
        imgUrl,
        imgPath,
        { 'X-Emby-Token': accessToken },
      );
    } catch { /* non-critical */ }
  }

  cancelDownload(itemId: string): void {
    const download = this.downloads.get(itemId);
    if (download) {
      download.aborted = true;
      if (isDesktop) {
        cancelDesktopMediaDownload(itemId).catch(() => {});
      } else {
        DownloadPlugin.cancel({ itemId }).catch(() => {});
      }
      logger.log('🚫 Cancelling:', itemId);
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
