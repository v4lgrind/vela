import { ref, type Ref } from 'vue';
import { logger } from '@/utils/logger';

/**
 * Offline Detection Service
 *
 * Follows the device's network connectivity (airplane mode, no connection).
 * The Jellyfin server is deliberately not pinged: slow or flaky answers used to
 * flip the app into offline mode while the network was fine.
 */
class OfflineDetectionService {
  private static instance: OfflineDetectionService;

  public isOnline: Ref<boolean> = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);

  private eventListenersSetup = false;

  private constructor() {
    try {
      this.setupEventListeners();
    } catch (error) {
      logger.error('[OfflineDetection] Failed to setup event listeners:', error);
    }
  }

  public static getInstance(): OfflineDetectionService {
    if (!OfflineDetectionService.instance) {
      OfflineDetectionService.instance = new OfflineDetectionService();
    }
    return OfflineDetectionService.instance;
  }

  /**
   * Stop the service
   */
  public destroy(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  /**
   * Setup browser online/offline event listeners
   */
  private setupEventListeners(): void {
    if (typeof window === 'undefined' || this.eventListenersSetup) return;
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.eventListenersSetup = true;
  }

  /**
   * Handle browser online event
   */
  private handleOnline = (): void => {
    logger.log('[OfflineDetection] Browser is online');
    this.isOnline.value = true;
  };

  /**
   * Handle browser offline event
   */
  private handleOffline = (): void => {
    logger.log('[OfflineDetection] Browser is offline');
    this.isOnline.value = false;
  };

  /**
   * Re-read the device connectivity right now
   */
  public async checkNow(): Promise<boolean> {
    this.isOnline.value = navigator.onLine;
    return this.isOnline.value;
  }

  /**
   * Whether the device has a network connection
   */
  public get isFullyOnline(): boolean {
    return this.isOnline.value;
  }
}

// Export singleton instance
export const offlineDetection = OfflineDetectionService.getInstance();
