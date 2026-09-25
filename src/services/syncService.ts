import { offlineDatabase } from './offlineDatabase';
import { offlineDetection } from './offlineDetection';
import { logger } from '@/utils/logger';
import { jellyfinAuthorization } from '@/utils/jellyfinAuthorization';

/**
 * Sync Service
 *
 * Synchronizes offline watch progress to Jellyfin server when back online.
 */
class SyncService {
  private static instance: SyncService;
  private isSyncing = false;

  private constructor() {}

  public static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  /**
   * Sync unsynced watch progress to Jellyfin
   */
  public async syncWatchProgress(
    serverUrl: string,
    accessToken: string
  ): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) {
      logger.log('[SyncService] Sync already in progress');
      return { synced: 0, failed: 0 };
    }

    if (!offlineDetection.isFullyOnline) {
      logger.log('[SyncService] Cannot sync: offline');
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    let syncedCount = 0;
    let failedCount = 0;

    try {
      const unsyncedProgress = await offlineDatabase.getUnsyncedProgress();
      logger.log(`[SyncService] Found ${unsyncedProgress.length} unsynced progress entries`);

      if (unsyncedProgress.length === 0) {
        return { synced: 0, failed: 0 };
      }

      for (const progress of unsyncedProgress) {
        try {
          // Report playback stopped with position to Jellyfin
          const url = `${serverUrl}/Sessions/Playing/Stopped`;

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: jellyfinAuthorization(accessToken),
            },
            body: JSON.stringify({
              ItemId: progress.itemId,
              PositionTicks: Math.floor(progress.position * 10000000), // Convert seconds to ticks
              PlayedPercentage: progress.percentage,
            }),
          });

          if (response.ok) {
            // Mark as synced in database
            await offlineDatabase.markProgressSynced(progress.itemId);
            syncedCount++;
            logger.log(`[SyncService] Synced progress for ${progress.itemId}`);
          } else {
            logger.error(
              `[SyncService] Failed to sync ${progress.itemId}: HTTP ${response.status}`
            );
            failedCount++;
          }
        } catch (error) {
          logger.error(`[SyncService] Error syncing ${progress.itemId}:`, error);
          failedCount++;
        }
      }

      logger.log(
        `[SyncService] Sync complete: ${syncedCount} synced, ${failedCount} failed`
      );
    } catch (error) {
      logger.error('[SyncService] Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }

    return { synced: syncedCount, failed: failedCount };
  }

  /**
   * Check if sync is currently in progress
   */
  public get isInProgress(): boolean {
    return this.isSyncing;
  }
}

// Export singleton instance
export const syncService = SyncService.getInstance();
