import { buildDownloadedMedia, offlineDatabase, type DownloadedMedia } from './offlineDatabase';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

import { usePlatform } from '@/composables/usePlatform';
import { DownloadPlugin } from '@/plugins/DownloadPlugin';
import type { DownloadPlan, ImageRef, MediaBackend, MediaItem } from '@/domain';
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

/** Cached images keep their first-schema keys (`<itemId>_<Primary|Backdrop>.jpg`). */
export type OfflineArtworkType = 'Primary' | 'Backdrop';

export interface OfflineArtworkTarget {
  itemId: string;
  imageType: OfflineArtworkType;
  ref: ImageRef;
  maxWidth: number;
}

/** Turns an image ref into a fetchable URL (the active backend). */
export type ArtworkResolver = (ref: ImageRef, maxWidth: number) => { url: string; headers: Record<string, string> };

const MAX_CACHED_PEOPLE = 20;

/** Artwork comes from the signed-in server, with its auth headers. */
export function artworkResolverFor(backend: MediaBackend): ArtworkResolver {
  return (ref, maxWidth) => ({ url: backend.imageUrl(ref, { width: maxWidth }), headers: backend.authHeaders() });
}

/**
 * Every image the offline library and detail page show for an item: its own
 * art, the series art of an episode, the album cover of a track, cast portraits.
 * Duplicate keys are collapsed because an episode shares artwork with its series.
 */
export function buildOfflineArtworkTargets(item: MediaItem): OfflineArtworkTarget[] {
  const targets = new Map<string, OfflineArtworkTarget>();
  const add = (itemId: string | undefined, imageType: OfflineArtworkType, ref: ImageRef | undefined, maxWidth: number) => {
    if (itemId && ref) targets.set(`${itemId}:${imageType}`, { itemId, imageType, ref, maxWidth });
  };
  const { images } = item;
  if (item.kind === 'episode') {
    add(item.id, 'Primary', images.thumb ?? images.poster, 960);
    add(item.seriesId, 'Primary', images.poster, 600);
    add(item.seriesId, 'Backdrop', images.backdrop, 1920);
  } else {
    add(item.id, 'Primary', images.poster, 600);
    add(item.id, 'Backdrop', images.backdrop, 1920);
  }
  // A track rarely has its own image: the album cover is what lists show.
  if (item.kind === 'track') add(item.albumId, 'Primary', images.poster, 600);
  const credits = 'credits' in item ? item.credits : [];
  for (const person of credits.slice(0, MAX_CACHED_PEOPLE)) add(person.personId, 'Primary', person.image, 400);
  return [...targets.values()];
}

const FOLDER_BY_KIND: Partial<Record<MediaItem['kind'], (item: MediaItem, clean: (v: string | undefined, f: string) => string) => string>> = {
  movie: (item, clean) => `Movies/${clean(item.title, 'Unknown')}`,
  episode: (item, clean) => (item.kind === 'episode'
    ? `TV Shows/${clean(item.seriesTitle, 'Unknown Series')}/Season ${item.seasonNumber ?? 1}` : ''),
  track: (item, clean) => (item.kind === 'track'
    ? `Music/${clean(item.albumArtist ?? item.artists[0]?.name, 'Unknown Artist')}/${clean(item.albumTitle, 'Unknown Album')}` : ''),
};

class DownloadService {
  private downloads: Map<string, ActiveDownload> = new Map();
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();
  private artworkDownloads: Map<string, Promise<void>> = new Map();

  /**
   * Download file for offline use via native Android ForegroundService.
   * The download survives app backgrounding, screen-off, and retries on network errors.
   */
  async downloadForOffline(
    item: MediaItem,
    serverId: string,
    plan: DownloadPlan,
    resolveArtwork: ArtworkResolver,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<void> {
    const itemId = item.id;
    if (this.downloads.has(itemId)) {
      throw new Error(`Download already in progress for ${itemId}`);
    }

    const filename = this.sanitizeFilename(`${item.title || itemId}.${plan.fileExtension}`);
    const filePath = this.buildFilePath(item, filename);
    const downloadUrl = plan.url;
    const authHeaders = plan.headers;
    const estimatedSize = plan.estimatedSizeBytes;
    logger.log(plan.isTranscoded ? '📥 Transcoded download:' : '📥 Native download:', filename);

    if (onProgress) this.progressCallbacks.set(itemId, onProgress);

    const activeDownload: ActiveDownload = { aborted: false };
    this.downloads.set(itemId, activeDownload);
    let storedFilePath = filePath;
    // Reported by the native downloader: its content:// files can't be stat'ed.
    let fileSize = 0;

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
        localStorage.setItem(`dl_meta_${itemId}`, JSON.stringify({ item, serverId, markers: plan.markers, filePath }));
        ({ filePath: storedFilePath, fileSize } = await this.downloadAndroidFile({
          activeDownload,
          estimatedSize,
          headers: authHeaders,
          itemName: item.title || '',
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
        }));
      }

      if (activeDownload.aborted) {
        throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
      }

      logger.log('💾 Download complete:', filePath);

      // Actual file size after completion
      if (!fileSize) {
        try {
          const stat = await this.statFile(storedFilePath);
          fileSize = stat.size ?? 0;
        } catch { /* ignore */ }
      }

      const downloadedMedia: DownloadedMedia = buildDownloadedMedia(item, serverId, storedFilePath, fileSize, plan.markers);

      // Sidecar subtitle file, in the format the backend chose for this platform
      // (WebVTT for Chromium's <track>, SRT for ExoPlayer).
      const subtitle = plan.sidecars[0];
      if (subtitle) {
        try {
          const subPath = filePath.replace(/\.[^.]+$/, `.${subtitle.format}`);
          logger.log('📝 Downloading subtitle:', subPath);
          downloadedMedia.subtitleFilePath = isDesktop
            ? await this.downloadDesktopSidecar(`subtitle-${itemId}`, subtitle.url, subPath, authHeaders)
            : await this.downloadAndroidFile({
                activeDownload,
                headers: authHeaders,
                itemName: `${item.title || itemId} subtitles`,
                operationId: `subtitle-${itemId}`,
                relativePath: subPath,
                url: subtitle.url,
              }).then((result) => result.filePath);
          downloadedMedia.subtitleLabel = subtitle.label;
          downloadedMedia.subtitleLanguage = subtitle.language;
        } catch (e) {
          logger.warn('⚠️ Subtitle download failed (non-critical):', e);
        }
      }

      if (activeDownload.aborted) {
        throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
      }

      await offlineDatabase.addDownload(downloadedMedia);
      localStorage.removeItem(`dl_meta_${itemId}`);
      logger.log('✅ Download complete:', filename);

      // Artwork is part of the offline contract. Wait for every requested image
      // before reporting completion so airplane mode cannot race this work.
      await this.cacheArtwork(buildOfflineArtworkTargets(item), resolveArtwork);

      // Final 100% callback
      const callback = this.progressCallbacks.get(itemId);
      if (callback) callback({ itemId, filename, loaded: fileSize, total: fileSize, percentage: 100 });

    } catch (error: any) {
      if (error.name === 'AbortError' || activeDownload.aborted) {
        logger.log('🚫 Download cancelled:', item.title);
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
    if (filePath.startsWith('content://')) {
      await DownloadPlugin.delete({ uri: filePath });
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

  private async downloadAndroidFile(options: NativeDownloadOptions): Promise<{ filePath: string; fileSize: number }> {
    const handles: PluginListenerHandle[] = [];
    if (options.activeDownload) {
      options.activeDownload.nativeOperationId = options.operationId;
    }

    const cleanup = async () => {
      for (const handle of handles) {
        try { await handle.remove(); } catch { /* ignore */ }
      }
    };

    return new Promise<{ filePath: string; fileSize: number }>((resolve, reject) => {
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
          resolve({ filePath: event.filePath || options.relativePath, fileSize: event.fileSize || 0 });
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

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[/\\?%*:|"<>]/g, '-');
  }

  private buildFilePath(item: MediaItem, filename: string): string {
    const clean = (v: string | undefined, fallback: string) => this.sanitizeFilename(v || fallback);
    const folder = FOLDER_BY_KIND[item.kind]?.(item, clean);
    return folder ? `Vela/${folder}/${filename}` : `Vela/${filename}`;
  }

  /** Caches images for the offline views; failures are tolerated (placeholders show instead). */
  async cacheArtwork(targets: OfflineArtworkTarget[], resolve: ArtworkResolver): Promise<void> {
    await Promise.allSettled(targets.map(({ itemId, imageType, ref, maxWidth }) => {
      const { url, headers } = resolve(ref, maxWidth);
      return this.cacheImage(itemId, imageType, url, headers);
    }));
  }

  /**
   * Get a WebView-accessible URL for a cached artwork image.
   * Returns null if the image is not cached locally.
   */
  async getCachedImageUrl(
    itemId: string,
    imageType: OfflineArtworkType = 'Primary',
  ): Promise<string | null> {
    const imgPath = `Vela/Images/${itemId}_${imageType}.jpg`;
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
  /**
   * Cache one image, de-duplicating concurrent episode downloads that share
   * series, season, or cast artwork.
   */
  async cacheImage(
    itemId: string,
    imageType: OfflineArtworkType,
    url: string,
    headers: Record<string, string>,
  ): Promise<void> {
    const imgPath = `Vela/Images/${itemId}_${imageType}.jpg`;
    try {
      await this.statFile(imgPath);
      return;
    } catch { /* not cached yet */ }

    const pending = this.artworkDownloads.get(imgPath);
    if (pending) return pending;

    const task = (async () => {
      const dirPath = imgPath.substring(0, imgPath.lastIndexOf('/'));
      try {
        await this.ensureDirectory(dirPath);
      } catch { /* may exist */ }

      await this.downloadFile(`artwork-${imageType}-${itemId}`, url, imgPath, headers);
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
