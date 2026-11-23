import type { MediaBackend } from '@/domain';
import { logger } from '@/utils/logger';

import { offlineDatabase } from './offlineDatabase';
import { offlineDetection } from './offlineDetection';

const MS_PER_SECOND = 1000;

/**
 * Pushes watch progress saved offline to the signed-in server when back
 * online. The server decides who wins (see `userData.pushOfflineProgress`).
 */
class SyncService {
  private isSyncing = false;

  /** `isOwnItem` keeps progress of another server's downloads for that server. */
  async syncWatchProgress(
    backend: MediaBackend,
    isOwnItem: (itemId: string) => boolean,
  ): Promise<{ synced: number; failed: number; kept: number }> {
    const result = { synced: 0, failed: 0, kept: 0 };
    if (this.isSyncing || !offlineDetection.isFullyOnline) return result;
    this.isSyncing = true;
    try {
      const unsynced = (await offlineDatabase.getUnsyncedProgress()).filter((progress) => isOwnItem(progress.itemId));
      for (const progress of unsynced) {
        try {
          const outcome = await backend.userData.pushOfflineProgress({
            itemId: progress.itemId,
            positionMs: Math.round(progress.position * MS_PER_SECOND),
            played: progress.completed,
            lastPlayedAtMs: progress.lastWatched,
          });
          await offlineDatabase.markProgressSynced(progress.itemId);
          if (outcome === 'kept') result.kept++;
          else result.synced++;
        } catch (error) {
          logger.error(`[SyncService] Failed to sync ${progress.itemId}:`, error);
          result.failed++;
        }
      }
    } catch (error) {
      logger.error('[SyncService] Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
    return result;
  }

  get isInProgress(): boolean {
    return this.isSyncing;
  }
}

export const syncService = new SyncService();
