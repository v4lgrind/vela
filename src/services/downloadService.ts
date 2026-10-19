import { buildDownloadedMedia, offlineDatabase, type DownloadedMedia } from './offlineDatabase';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

import { usePlatform } from '@/composables/usePlatform';
import { DownloadPlugin } from '@/plugins/DownloadPlugin';
import { getPrimaryContainer } from '@/utils/desktopCodec';
import { jellyfinAuthorization } from '@/utils/jellyfinAuthorization';
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
  nativeOperationId?: string;
}

interface NativeDownloadOptions {
  activeDownload?: ActiveDownload;
  estimatedSize?: number;
  headers: Record<string, string>;
  itemName: string;
  onProgress?: (loaded: number, total: number) => void;
  operationId: string;
  relativePath: string;
  url: string;
}

export type OfflineArtworkType = 'Primary' | 'Backdrop';

export interface OfflineArtworkTarget {
  itemId: string;
  imageType: OfflineArtworkType;
  maxWidth: number;
}

interface OfflineArtworkMetadata {
  Id?: string;
  Type?: string;
  SeriesId?: string;
  SeasonId?: string;
  People?: Array<{
    Id?: string;
    PrimaryImageTag?: string;
  }>;
}

/**
 * Build the complete image set required by the offline library and detail page.
 * Duplicate IDs are collapsed because an episode can share artwork with a parent.
 */
export function buildOfflineArtworkTargets(metadata: OfflineArtworkMetadata): OfflineArtworkTarget[] {
  const targets = new Map<string, OfflineArtworkTarget>();
  const add = (itemId: string | undefined, imageType: OfflineArtworkType, maxWidth: number) => {
    if (!itemId) return;
    targets.set(`${itemId}:${imageType}`, { itemId, imageType, maxWidth });
  };

  add(metadata.Id, 'Primary', metadata.Type === 'Episode' ? 960 : 600);
  add(metadata.Id, 'Backdrop', 1920);

  if (metadata.Type === 'Episode') {
    add(metadata.SeriesId, 'Primary', 600);
    add(metadata.SeriesId, 'Backdrop', 1920);
    add(metadata.SeasonId, 'Primary', 600);
  }

  for (const person of (metadata.People || []).slice(0, 20)) {
    if (person.PrimaryImageTag) add(person.Id, 'Primary', 400);
  }

  return [...targets.values()];
}


class DownloadService {
  private downloads: Map<string, ActiveDownload> = new Map();
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();
  private artworkDownloads: Map<string, Promise<void>> = new Map();

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
    const authHeaders = { Authorization: jellyfinAuthorization(accessToken) };

    if (transcodedUrl) {
      logger.log('📥 Transcoded download:', filename);
    } else {
      logger.log('📥 Native download:', filename);
    }

    if (onProgress) this.progressCallbacks.set(itemId, onProgress);

    const activeDownload: ActiveDownload = { aborted: false };
    this.downloads.set(itemId, activeDownload);
    let storedFilePath = filePath;

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
        // Persist metadata so offline-store can reconcile a completed native download.
        localStorage.setItem(`dl_meta_${itemId}`, JSON.stringify({ metadata, filePath }));
        storedFilePath = await this.downloadAndroidFile({
          activeDownload,
          estimatedSize,
          headers: authHeaders,
          itemName: metadata.Name || '',
          operationId: itemId,
          relativePath: filePath,
          url: downloadUrl,
          onProgress: (loaded, reportedTotal) => {
            const callback = this.progressCallbacks.get(itemId);
            if (!callback) return;
            const total = reportedTotal > 0 ? reportedTotal : (estimatedSize || 0);
            const percentage = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : -1;
            callback({ filename, itemId, loaded, percentage, total });
          },
        });
      }

      if (activeDownload.aborted) {
        throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
      }

      logger.log('💾 Download complete:', filePath);

      // Actual file size after completion
      let fileSize = 0;
      try {
        const stat = await this.statFile(storedFilePath);
        fileSize = stat.size ?? 0;
      } catch { /* ignore */ }

      const downloadedMedia: DownloadedMedia = buildDownloadedMedia(metadata, storedFilePath, fileSize);

      // Download sidecar subtitle file. Desktop uses WebVTT (the only format
      // Chromium's <track> renders); Android uses SRT for ExoPlayer. The
      // server converts from the source format either way.
      if (subtitleInfo && subtitleInfo.streamIndex >= 0) {
        try {
          const subExtension = isDesktop ? 'vtt' : 'srt';
          const subPath = filePath.replace(/\.[^.]+$/, `.${subExtension}`);
          const subUrl = `${serverUrl}/Videos/${itemId}/${itemId}/Subtitles/${subtitleInfo.streamIndex}/Stream.${subExtension}`;
          logger.log('📝 Downloading subtitle:', subPath);
          downloadedMedia.subtitleFilePath = isDesktop
            ? await this.downloadDesktopSidecar(`subtitle-${itemId}`, subUrl, subPath, authHeaders)
            : await this.downloadAndroidFile({
                activeDownload,
                headers: authHeaders,
                itemName: `${metadata.Name || itemId} subtitles`,
                operationId: `subtitle-${itemId}`,
                relativePath: subPath,
                url: subUrl,
              });
          downloadedMedia.subtitleLabel = subtitleInfo.label;
          downloadedMedia.subtitleLanguage = subtitleInfo.language;
          logger.log('✅ Subtitle downloaded:', subPath);
        } catch (e) {
          logger.warn('⚠️ Subtitle download failed (non-critical):', e);
        }
      }

      if (activeDownload.aborted) {
        throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
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

      // Artwork is part of the offline contract. Wait for every requested image
      // before reporting completion so airplane mode cannot race this work.
      await this.cacheArtworkForMetadata(serverUrl, accessToken, metadata);

      // Final 100% callback
      const callback = this.progressCallbacks.get(itemId);
      if (callback) callback({ itemId, filename, loaded: fileSize, total: fileSize, percentage: 100 });

    } catch (error: any) {
      if (error.name === 'AbortError' || activeDownload.aborted) {
        logger.log('🚫 Download cancelled:', metadata.Name);
        try { await this.deleteFile(storedFilePath); } catch { /* ignore */ }
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

  /** Raw file:// or content:// URI for native players, which can't read WebView URLs. */
  async getNativeFileUri(itemId: string): Promise<string | null> {
    const download = await offlineDatabase.getDownload(itemId);
    if (!download) return null;
    if (this.isAndroidPublicPath(download.filePath)) return download.filePath;
    const fileInfo = await Filesystem.getUri({ path: download.filePath, directory: Directory.Data });
    return fileInfo.uri;
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

    const result = await Filesystem.stat(this.getAndroidFileOptions(filePath));
    return { size: result.size ?? 0 };
  }

  private async deleteFile(filePath: string): Promise<void> {
    if (isDesktop) {
      await deleteDesktopMedia(filePath);
      return;
    }
    await Filesystem.deleteFile(this.getAndroidFileOptions(filePath));
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

  private async downloadDesktopSidecar(
    operationId: string,
    url: string,
    filePath: string,
    headers: Record<string, string>,
  ): Promise<string> {
    await this.downloadFile(operationId, url, filePath, headers);
    return filePath;
  }

  private async downloadAndroidFile(options: NativeDownloadOptions): Promise<string> {
    const handles: PluginListenerHandle[] = [];
    if (options.activeDownload) {
      options.activeDownload.nativeOperationId = options.operationId;
    }

    const cleanup = async () => {
      for (const handle of handles) {
        try { await handle.remove(); } catch { /* ignore */ }
      }
    };

    return new Promise<string>((resolve, reject) => {
      (async () => {
        handles.push(await DownloadPlugin.addListener('downloadProgress', (event) => {
          if (event.itemId !== options.operationId) return;
          if (options.activeDownload?.aborted) {
            DownloadPlugin.cancel({ itemId: options.operationId }).catch(() => {});
            return;
          }
          options.onProgress?.(event.loaded, event.total);
        }));
        handles.push(await DownloadPlugin.addListener('downloadComplete', async (event) => {
          if (event.itemId !== options.operationId) return;
          await cleanup();
          resolve(event.filePath || options.relativePath);
        }));
        handles.push(await DownloadPlugin.addListener('downloadFailed', async (event) => {
          if (event.itemId !== options.operationId) return;
          await cleanup();
          if (options.activeDownload?.aborted || event.error === 'AbortError') {
            reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
            return;
          }
          reject(new Error(event.error));
        }));
        await DownloadPlugin.enqueue({
          destPath: options.relativePath,
          estimatedSize: options.estimatedSize || 0,
          headers: options.headers,
          itemId: options.operationId,
          itemName: options.itemName,
          url: options.url,
        });
      })().catch(async (error) => {
        await cleanup();
        reject(error);
      });
    });
  }

  private async getFileUrl(filePath: string): Promise<string> {
    if (isDesktop) return getDesktopMediaUrl(filePath);
    if (this.isAndroidPublicPath(filePath)) return Capacitor.convertFileSrc(filePath);
    const fileInfo = await Filesystem.getUri({ path: filePath, directory: Directory.Data });
    return Capacitor.convertFileSrc(fileInfo.uri);
  }

  private isAndroidPublicPath(filePath: string): boolean {
    return filePath.startsWith('content://') || filePath.startsWith('file://') || filePath.startsWith('/');
  }

  private getAndroidFileOptions(filePath: string): { path: string; directory?: Directory } {
    return this.isAndroidPublicPath(filePath)
      ? { path: filePath }
      : { directory: Directory.Data, path: filePath };
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
   * Cache every image used by offline list/detail views: item poster/backdrop,
   * episode parents, and cast portraits.
   */
  async cacheArtworkForMetadata(
    serverUrl: string,
    accessToken: string,
    metadata: OfflineArtworkMetadata,
  ): Promise<void> {
    await Promise.allSettled(
      buildOfflineArtworkTargets(metadata).map(({ itemId, imageType, maxWidth }) =>
        this.cacheArtworkById(serverUrl, accessToken, itemId, imageType, maxWidth)
      ),
    );
  }

  /**
   * Get a WebView-accessible URL for a cached artwork image.
   * Returns null if the image is not cached locally.
   */
  async getCachedImageUrl(
    itemId: string,
    imageType: OfflineArtworkType = 'Primary',
  ): Promise<string | null> {
    const imgPath = `Jellyfin V4lgrind/Images/${itemId}_${imageType}.jpg`;
    try {
      await this.statFile(imgPath);
      return await this.getFileUrl(imgPath);
    } catch {
      return null;
    }
  }

  /**
   * Cache one image, de-duplicating concurrent episode downloads that share
   * series, season, or cast artwork.
   */
  async cacheArtworkById(
    serverUrl: string,
    accessToken: string,
    itemId: string,
    imageType: OfflineArtworkType = 'Primary',
    maxWidth = 400,
  ): Promise<void> {
    const imgPath = `Jellyfin V4lgrind/Images/${itemId}_${imageType}.jpg`;
    try {
      await this.statFile(imgPath);
      return;
    } catch { /* not cached yet */ }

    const pending = this.artworkDownloads.get(imgPath);
    if (pending) return pending;

    const task = (async () => {
      const imgUrl = `${serverUrl}/Items/${itemId}/Images/${imageType}?maxWidth=${maxWidth}&quality=80`;
      const dirPath = imgPath.substring(0, imgPath.lastIndexOf('/'));
      try {
        await this.ensureDirectory(dirPath);
      } catch { /* may exist */ }

      await this.downloadFile(
        `artwork-${imageType}-${itemId}`,
        imgUrl,
        imgPath,
        { Authorization: jellyfinAuthorization(accessToken) },
      );
    })();

    this.artworkDownloads.set(imgPath, task);
    try {
      await task;
    } catch (error) {
      logger.warn(`Artwork download failed: ${itemId}/${imageType}`, error);
      throw error;
    } finally {
      this.artworkDownloads.delete(imgPath);
    }
  }

  cancelDownload(itemId: string): void {
    const download = this.downloads.get(itemId);
    if (download) {
      download.aborted = true;
      if (isDesktop) {
        cancelDesktopMediaDownload(itemId).catch(() => {});
      } else {
        DownloadPlugin.cancel({ itemId: download.nativeOperationId || itemId }).catch(() => {});
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
