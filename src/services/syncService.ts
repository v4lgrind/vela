import { offlineDatabase } from './offlineDatabase';
import { offlineDetection } from './offlineDetection';
import { logger } from '@/utils/logger';
import { jellyfinAuthorization } from '@/utils/jellyfinAuthorization';
import { shouldPushLocal } from '@/utils/watchProgress';

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
   * Sync unsynced watch progress to Jellyfin. The most recent playback wins:
   * a position Jellyfin recorded later (another device) is kept, not overwritten.
   */
  public async syncWatchProgress(
    serverUrl: string,
    accessToken: string,
    userId: string,
  ): Promise<{ synced: number; failed: number; kept: number }> {
    const result = { synced: 0, failed: 0, kept: 0 };
    if (this.isSyncing) {
      logger.log('[SyncService] Sync already in progress');
      return result;
    }

    if (!offlineDetection.isFullyOnline) {
      logger.log('[SyncService] Cannot sync: offline');
      return result;
    }

    this.isSyncing = true;
    const headers = { 'Content-Type': 'application/json', Authorization: jellyfinAuthorization(accessToken) };

    try {
      const unsyncedProgress = await offlineDatabase.getUnsyncedProgress();
      logger.log(`[SyncService] Found ${unsyncedProgress.length} unsynced progress entries`);

      for (const progress of unsyncedProgress) {
        const url = `${serverUrl}/UserItems/${progress.itemId}/UserData?userId=${encodeURIComponent(userId)}`;
        try {
          const current = await fetch(url, { headers });
          if (!current.ok) throw new Error(`HTTP ${current.status}`);
          if (!shouldPushLocal(progress, await current.json())) {
            await offlineDatabase.markProgressSynced(progress.itemId);
            result.kept++;
            continue;
          }

          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              PlaybackPositionTicks: progress.completed ? 0 : Math.round(progress.position * 10_000_000),
              Played: progress.completed,
              LastPlayedDate: new Date(progress.lastWatched).toISOString(),
            }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await offlineDatabase.markProgressSynced(progress.itemId);
          result.synced++;
        } catch (error) {
          logger.error(`[SyncService] Failed to sync ${progress.itemId}:`, error);
          result.failed++;
        }
      }

      logger.log(`[SyncService] Sync complete: ${result.synced} synced, ${result.kept} kept, ${result.failed} failed`);
    } catch (error) {
      logger.error('[SyncService] Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }

    return result;
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
