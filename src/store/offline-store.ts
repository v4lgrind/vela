import { defineStore } from 'pinia';
import { offlineDetection } from '../services/offlineDetection';
import { usePreferencesStore } from './preferences-store';
import { offlineDatabase, type DownloadedMedia } from '../services/offlineDatabase';
import { syncService } from '../services/syncService';
import { useJellyfinStore } from './jellyfin-store';

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
          console.log('[OfflineStore] Database initialized');
        } catch (dbError) {
          console.error('[OfflineStore] IndexedDB init failed (continuing without offline):', dbError);
          this.initialized = true;
          return;
        }

        // Load downloads from IndexedDB
        try {
          await this.loadDownloads();
        } catch (loadError) {
          console.error('[OfflineStore] Failed to load downloads:', loadError);
        }

        // Initialize offline detection with server URL
        try {
          const jellyfinStore = useJellyfinStore();
          if (jellyfinStore.serverUrl) {
            offlineDetection.init(jellyfinStore.serverUrl);
            console.log('[OfflineStore] Offline detection initialized');
          }
        } catch (detectionError) {
          console.error('[OfflineStore] Offline detection init failed:', detectionError);
        }

        // Setup auto-sync when coming back online
        try {
          this.setupAutoSync();
        } catch (syncError) {
          console.error('[OfflineStore] Auto-sync setup failed:', syncError);
        }

        // Mark as initialized
        this.initialized = true;
      } catch (error) {
        console.error('[OfflineStore] Failed to initialize:', error);
        // Mark as initialized even on error to prevent UI crashes
        this.initialized = true;
      }
    },

    /**
     * Load downloads from IndexedDB
     */
    async loadDownloads() {
      try {
        this.downloads = await offlineDatabase.getAllDownloads();
        console.log(`[OfflineStore] Loaded ${this.downloads.length} downloads`);
      } catch (error) {
        console.error('[OfflineStore] Failed to load downloads:', error);
      }
    },

    /**
     * Add a download
     */
    async addDownload(media: DownloadedMedia) {
      try {
        await offlineDatabase.addDownload(media);
        await this.loadDownloads(); // Refresh from database
        console.log('[OfflineStore] Added download:', media.itemId);
      } catch (error) {
        console.error('[OfflineStore] Failed to add download:', error);
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
        console.log('[OfflineStore] Removed download:', itemId);
      } catch (error) {
        console.error('[OfflineStore] Failed to remove download:', error);
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
          console.log('[OfflineStore] Back online, triggering sync...');
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
        console.log('[OfflineStore] Skipping sync (already in progress or offline)');
        return;
      }

      const jellyfinStore = useJellyfinStore();

      if (!jellyfinStore.serverUrl || !jellyfinStore.accessToken) {
        console.error('[OfflineStore] Cannot sync: API not initialized');
        return;
      }

      this.syncInProgress = true;

      try {
        const result = await syncService.syncWatchProgress(
          jellyfinStore.serverUrl,
          jellyfinStore.accessToken
        );

        this.lastSyncTime = Date.now();
        console.log(`[OfflineStore] Sync complete: ${result.synced} synced, ${result.failed} failed`);
      } catch (error) {
        console.error('[OfflineStore] Sync failed:', error);
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
        console.log('[OfflineStore] Cleared all offline data');
      } catch (error) {
        console.error('[OfflineStore] Failed to clear data:', error);
        throw error;
      }
    },
  },
});
