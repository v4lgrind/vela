import { defineStore } from 'pinia';
import { offlineDetection } from '../services/offlineDetection';
import { usePreferencesStore } from './preferences-store';
import { buildDownloadedMedia, offlineDatabase, type DownloadedMedia } from '../services/offlineDatabase';
import { downloadService } from '../services/downloadService';
import { syncService } from '../services/syncService';
import { useJellyfinStore } from './jellyfin-store';
import { useMetadataCacheStore } from './metadata-cache-store';
import { Capacitor } from '@capacitor/core';
import { DownloadPlugin } from '@/plugins/DownloadPlugin';
import { logger } from '@/utils/logger';

interface State {
  downloads: DownloadedMedia[];
  syncInProgress: boolean;
  lastSyncTime: number;
  initialized: boolean;
  offlineAssetsRefreshInProgress: boolean;
  offlineAssetsRefreshed: boolean;
}

export const useOfflineStore = defineStore('offline', {
  state: (): State => ({
    downloads: [],
    syncInProgress: false,
    lastSyncTime: 0,
    initialized: false,
    offlineAssetsRefreshInProgress: false,
    offlineAssetsRefreshed: false,
  }),

  persist: {
    pick: ['lastSyncTime'],
  },

  getters: {
    /**
     * Get online status from offline detection service
     */
    isOnline: () => offlineDetection.isOnline.value,

    /**
     * Get fully online status (device online AND offline mode not forced)
     */
    isFullyOnline: (state) => {
      if (!state.initialized) return true;
      const prefs = usePreferencesStore();
      if (prefs.forceOfflineMode) return false;
      return offlineDetection.isFullyOnline;
    },

    /**
     * Get downloads count
     */
    downloadCount: (state) => state.downloads.length,

    /**
     * Get total storage used (in bytes)
     */
    totalStorageUsed: (state) => {
      return state.downloads.reduce((total, download) => total + download.fileSize, 0);
    },

    /**
     * Get TV shows organized by series
     */
    tvShowsGrouped: (state) => {
      const episodes = state.downloads.filter((d) => d.type === 'Episode');
      const seriesMap = new Map<string, any>();

      episodes.forEach((episode) => {
        if (!episode.seriesId || !episode.seriesName) return;

        if (!seriesMap.has(episode.seriesId)) {
          seriesMap.set(episode.seriesId, {
            seriesId: episode.seriesId,
            seriesName: episode.seriesName,
            seasons: new Map<string, any>(),
          });
        }

        const series = seriesMap.get(episode.seriesId)!;

        if (episode.seasonId) {
          if (!series.seasons.has(episode.seasonId)) {
            series.seasons.set(episode.seasonId, {
              seasonId: episode.seasonId,
              seasonNumber: episode.seasonNumber,
              episodes: [],
            });
          }

          const season = series.seasons.get(episode.seasonId)!;
          season.episodes.push(episode);
        }
      });

      // Convert Maps to arrays and sort
      const result = Array.from(seriesMap.values()).map((series) => ({
        seriesId: series.seriesId,
        seriesName: series.seriesName,
        seasons: Array.from(series.seasons.values())
          .sort((a: any, b: any) => (a.seasonNumber || 0) - (b.seasonNumber || 0))
          .map((season: any) => ({
            seasonId: season.seasonId,
            seasonNumber: season.seasonNumber,
            episodes: season.episodes.sort(
              (a: DownloadedMedia, b: DownloadedMedia) =>
                (a.episodeNumber || 0) - (b.episodeNumber || 0)
            ),
          })),
      }));

      return result.sort((a: any, b: any) => a.seriesName.localeCompare(b.seriesName));
    },
  },

  actions: {
    /**
     * Initialize the offline store
     */
    async init() {
      try {
        // Initialize the database
        try {
          await offlineDatabase.init();
          logger.log('[OfflineStore] Database initialized');
        } catch (dbError) {
          logger.error('[OfflineStore] IndexedDB init failed (continuing without offline):', dbError);
          this.initialized = true;
          return;
        }

        // Load downloads from IndexedDB
        try {
          await this.loadDownloads();
        } catch (loadError) {
          logger.error('[OfflineStore] Failed to load downloads:', loadError);
        }

        // Recover downloads that completed natively while the app was killed
        try {
          await this.reconcileNativeDownloads();
        } catch (reconcileError) {
          logger.error('[OfflineStore] Reconcile failed:', reconcileError);
        }

        // Setup auto-sync when coming back online
        try {
          this.setupAutoSync();
        } catch (syncError) {
          logger.error('[OfflineStore] Auto-sync setup failed:', syncError);
        }

        // Mark as initialized
        this.initialized = true;

        // Records saved before sizes and library ids were stored: fix them in the background.
        this.backfillSizes()
          .then(() => this.backfillLibraryIds())
          .then(() => this.refreshDownloadedUserData())
          .catch((error) => logger.error('[OfflineStore] Backfill failed:', error));
      } catch (error) {
        logger.error('[OfflineStore] Failed to initialize:', error);
        // Mark as initialized even on error to prevent UI crashes
        this.initialized = true;
      }
    },

    /**
     * Re-check device connectivity right now and return true if fully online.
     */
    async recheckOnline(): Promise<boolean> {
      await offlineDetection.checkNow();
      return offlineDetection.isFullyOnline;
    },

    /**
     * Load downloads from IndexedDB
     */
    async loadDownloads() {
      try {
        this.downloads = await offlineDatabase.getAllDownloads();
        logger.log(`[OfflineStore] Loaded ${this.downloads.length} downloads`);
      } catch (error) {
        logger.error('[OfflineStore] Failed to load downloads:', error);
      }
    },

    /**
     * Backfill full metadata and every local image required by existing
     * downloads. New downloads already perform the same work before completion.
     */
    async refreshOfflineAssets() {
      if (
        this.offlineAssetsRefreshInProgress
        || this.offlineAssetsRefreshed
        || !this.isFullyOnline
      ) return;

      const jellyfinStore = useJellyfinStore();
      if (!jellyfinStore.serverUrl || !jellyfinStore.accessToken) return;

      this.offlineAssetsRefreshInProgress = true;
      let complete = true;
      const metadataCache = useMetadataCacheStore();

      try {
        for (const download of [...this.downloads]) {
          let metadata = download.jellyfinItem;
          try {
            const detailed = await jellyfinStore.fetchItemDetails(download.itemId);
            metadata = { ...metadata, ...detailed };
            await offlineDatabase.addDownload({ ...download, jellyfinItem: metadata });
          } catch (error) {
            complete = false;
            logger.warn('[OfflineStore] Could not refresh downloaded metadata:', download.itemId, error);
          }

          await downloadService.cacheArtworkForMetadata(
            jellyfinStore.serverUrl,
            jellyfinStore.accessToken,
            metadata,
          );

          if (download.type !== 'Episode') continue;
          const parentIds = [download.seriesId, download.seasonId]
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
          for (const parentId of parentIds) {
            let parent = metadataCache.get(parentId, true);
            if (!parent) {
              try {
                const fetched = await jellyfinStore.fetchItemDetails(parentId);
                if (!fetched) continue;
                metadataCache.set(fetched);
                parent = metadataCache.get(parentId, true);
              } catch (error) {
                complete = false;
                logger.warn('[OfflineStore] Could not refresh parent metadata:', parentId, error);
                continue;
              }
            }
            if (parent) {
              await downloadService.cacheArtworkForMetadata(
                jellyfinStore.serverUrl,
                jellyfinStore.accessToken,
                parent,
              );
            }
          }
        }
        await this.loadDownloads();
        this.offlineAssetsRefreshed = complete;
      } finally {
        this.offlineAssetsRefreshInProgress = false;
      }
    },

    /**
     * Recover downloads that completed natively (DownloadService) while the JS
     * layer was not running. The native service persists a "dl_done" list; we
     * drain it here, reconstruct the DB record from localStorage metadata saved
     * before the enqueue call, and save it to IndexedDB.
     */
    async reconcileNativeDownloads() {
      if (!Capacitor.isNativePlatform()) return;
      const { items } = await DownloadPlugin.getPendingCompletions();
      if (items.length === 0) return;
      logger.log(`[OfflineStore] Reconciling ${items.length} natively-completed download(s)`);
      for (const item of items) {
        try {
          const existing = await offlineDatabase.getDownload(item.itemId);
          if (existing) continue; // already in DB (e.g. app resumed before kill)
          const savedStr = localStorage.getItem(`dl_meta_${item.itemId}`);
          if (!savedStr) {
            logger.warn('[OfflineStore] No saved metadata for', item.itemId);
            continue;
          }
          const { metadata, filePath } = JSON.parse(savedStr) as { metadata: any; filePath: string };
          const media = buildDownloadedMedia(metadata, item.filePath || filePath, item.fileSize);
          await offlineDatabase.addDownload(media);
          localStorage.removeItem(`dl_meta_${item.itemId}`);
          logger.log('[OfflineStore] Reconciled:', metadata.Name);
        } catch (e) {
          logger.error('[OfflineStore] Failed to reconcile item', item.itemId, e);
        }
      }
      await this.loadDownloads();
    },

    /**
     * Add a download
     */
    async addDownload(media: DownloadedMedia) {
      try {
        await offlineDatabase.addDownload(media);
        await this.loadDownloads(); // Refresh from database
        logger.log('[OfflineStore] Added download:', media.itemId);
      } catch (error) {
        logger.error('[OfflineStore] Failed to add download:', error);
        throw error;
      }
    },

    /**
     * Remove a download
     */
    async removeDownload(itemId: string) {
      try {
        await offlineDatabase.deleteDownload(itemId);
        await this.loadDownloads(); // Refresh from database
        logger.log('[OfflineStore] Removed download:', itemId);
      } catch (error) {
        logger.error('[OfflineStore] Failed to remove download:', error);
        throw error;
      }
    },

    /**
     * Check if an item is downloaded
     */
    isItemDownloaded(itemId: string): boolean {
      return this.downloads.some((d) => d.itemId === itemId);
    },

    /**
     * Get a specific download
     */
    getDownload(itemId: string): DownloadedMedia | undefined {
      return this.downloads.find((d) => d.itemId === itemId);
    },

    /**
     * Get downloads for a series
     */
    async getSeriesDownloads(seriesId: string): Promise<DownloadedMedia[]> {
      return await offlineDatabase.getDownloadsBySeries(seriesId);
    },

    /**
     * Get downloads for a season
     */
    async getSeasonDownloads(seasonId: string): Promise<DownloadedMedia[]> {
      return await offlineDatabase.getDownloadsBySeason(seasonId);
    },

    /** Library of each download, from Jellyfin, for records that lack it (online only). */
    async backfillLibraryIds() {
      if (!this.isFullyOnline) return;
      const jellyfinStore = useJellyfinStore();
      if (!jellyfinStore.serverUrl || !jellyfinStore.accessToken) return;
      const missing = this.downloads.filter((download) => !download.libraryId);
      if (!missing.length) return;
      for (const download of missing) {
        try {
          const libraryId = await jellyfinStore.fetchLibraryIdOf(download.itemId);
          if (libraryId) await offlineDatabase.addDownload({ ...download, libraryId });
        } catch (error) {
          logger.warn('[OfflineStore] Could not find the library of', download.itemId, error);
        }
      }
      await this.loadDownloads();
    },

    /**
     * Fresh user data (position, played, last played date) for every download,
     * so progress made on another device shows offline too (online only).
     */
    async refreshDownloadedUserData() {
      if (!this.isFullyOnline || !this.downloads.length) return;
      const jellyfinStore = useJellyfinStore();
      if (!jellyfinStore.serverUrl || !jellyfinStore.accessToken) return;
      try {
        const items = await jellyfinStore.fetchItemsByIds(this.downloads.map((download) => download.itemId));
        const userData = new Map(items.map((item) => [item.Id, item.UserData]));
        for (const download of this.downloads) {
          const fresh = userData.get(download.itemId);
          if (fresh) await offlineDatabase.addDownload({ ...download, jellyfinItem: { ...download.jellyfinItem, UserData: fresh } });
        }
        await this.loadDownloads();
      } catch (error) {
        logger.warn('[OfflineStore] Could not refresh the user data of downloads:', error);
      }
    },

    /** Real size of Android downloads recorded as 0 B (content:// files can't be stat'ed). */
    async backfillSizes() {
      if (!Capacitor.isNativePlatform()) return;
      const missing = this.downloads.filter((download) => !download.fileSize && download.filePath.startsWith('content://'));
      if (!missing.length) return;
      for (const download of missing) {
        try {
          const { size } = await DownloadPlugin.size({ uri: download.filePath });
          await offlineDatabase.addDownload({ ...download, fileSize: size });
        } catch (error) {
          logger.warn('[OfflineStore] Could not read the size of', download.itemId, error);
        }
      }
      await this.loadDownloads();
    },

    /**
     * Setup auto-sync when coming back online
     */
    setupAutoSync() {
      // Watch for online status changes
      let previousOnlineStatus = offlineDetection.isFullyOnline;

      setInterval(() => {
        const currentOnlineStatus = offlineDetection.isFullyOnline;

        // Detect transition from offline to online
        if (!previousOnlineStatus && currentOnlineStatus) {
          logger.log('[OfflineStore] Back online, triggering sync...');
          this.syncWatchProgress();
          this.backfillLibraryIds();
        }

        previousOnlineStatus = currentOnlineStatus;
      }, 1000); // Check every second
    },

    /**
     * Sync unsynced watch progress to Jellyfin
     */
    async syncWatchProgress() {
      if (this.syncInProgress || !offlineDetection.isFullyOnline) {
        logger.log('[OfflineStore] Skipping sync (already in progress or offline)');
        return;
      }

      const jellyfinStore = useJellyfinStore();

      if (!jellyfinStore.serverUrl || !jellyfinStore.accessToken) {
        logger.error('[OfflineStore] Cannot sync: API not initialized');
        return;
      }

      this.syncInProgress = true;

      try {
        const result = await syncService.syncWatchProgress(
          jellyfinStore.serverUrl,
          jellyfinStore.accessToken,
          jellyfinStore.userId ?? '',
        );

        this.lastSyncTime = Date.now();
        logger.log(`[OfflineStore] Sync complete: ${result.synced} synced, ${result.kept} kept, ${result.failed} failed`);
        await this.refreshDownloadedUserData();
      } catch (error) {
        logger.error('[OfflineStore] Sync failed:', error);
      } finally {
        this.syncInProgress = false;
      }
    },

    /**
     * Clear all offline data
     */
    async clearAllData() {
      try {
        await offlineDatabase.clearAll();
        await this.loadDownloads();
        this.lastSyncTime = 0;
        logger.log('[OfflineStore] Cleared all offline data');
      } catch (error) {
        logger.error('[OfflineStore] Failed to clear data:', error);
        throw error;
      }
    },
  },
});
