import { defineStore } from 'pinia';
import { offlineDetection } from '../services/offlineDetection';
import { usePreferencesStore } from './preferences-store';
import { buildDownloadedMedia, offlineDatabase, type DownloadedMedia } from '../services/offlineDatabase';
import { syncService } from '../services/syncService';
import { useJellyfinStore } from './jellyfin-store';
import { Capacitor } from '@capacitor/core';
import { DownloadPlugin } from '@/plugins/DownloadPlugin';
import { logger } from '@/utils/logger';

interface State {
  downloads: DownloadedMedia[];
  syncInProgress: boolean;
  lastSyncTime: number;
  initialized: boolean;
}

export const useOfflineStore = defineStore('offline', {
  state: (): State => ({
    downloads: [],
    syncInProgress: false,
    lastSyncTime: 0,
    initialized: false,
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
     * Get server reachability status
     */
    serverReachable: () => offlineDetection.serverReachable.value,

    /**
     * Get fully online status (browser online AND server reachable)
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
     * Get downloads by type
     */
    movieDownloads: (state) => {
      return state.downloads.filter((d) => d.type === 'Movie');
    },

    episodeDownloads: (state) => {
      return state.downloads.filter((d) => d.type === 'Episode');
    },

    musicDownloads: (state) => {
      return state.downloads.filter((d) => d.type === 'MusicAlbum' || d.type === 'Audio');
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

        // Initialize offline detection with server URL and await the first check
        // so that serverReachable is accurate before we set initialized = true.
        // Without this, the watcher in App.vue sees isFullyOnline=false immediately
        // on page reload and incorrectly redirects to the offline library.
        try {
          const jellyfinStore = useJellyfinStore();
          if (jellyfinStore.serverUrl) {
            offlineDetection.init(jellyfinStore.serverUrl);
            await offlineDetection.checkNow();
            logger.log('[OfflineStore] Offline detection initialized');
          }
        } catch (detectionError) {
          logger.error('[OfflineStore] Offline detection init failed:', detectionError);
        }

        // Setup auto-sync when coming back online
        try {
          this.setupAutoSync();
        } catch (syncError) {
          logger.error('[OfflineStore] Auto-sync setup failed:', syncError);
        }

        // Mark as initialized
        this.initialized = true;
      } catch (error) {
        logger.error('[OfflineStore] Failed to initialize:', error);
        // Mark as initialized even on error to prevent UI crashes
        this.initialized = true;
      }
    },

    /**
     * Re-check server reachability right now and return true if fully online.
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
          const media = buildDownloadedMedia(metadata, filePath, item.fileSize);
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
          jellyfinStore.accessToken
        );

        this.lastSyncTime = Date.now();
        logger.log(`[OfflineStore] Sync complete: ${result.synced} synced, ${result.failed} failed`);
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
