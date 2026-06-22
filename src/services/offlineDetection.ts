import { ref, type Ref } from 'vue';
import { logger } from '@/utils/logger';

/**
 * Offline Detection Service
 *
 * Monitors network connectivity and Jellyfin server availability.
 * Provides reactive online/offline status for the application.
 */
class OfflineDetectionService {
  private static instance: OfflineDetectionService;

  public isOnline: Ref<boolean> = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);
  public serverReachable: Ref<boolean> = ref(false);

  private serverUrl: string = '';
  private pingInterval: number | null = null;
  private readonly PING_INTERVAL_MS = 30000; // 30 seconds
  private readonly PING_TIMEOUT_MS = 5000; // 5 seconds
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
   * Initialize the service with Jellyfin server URL
   */
  public init(serverUrl: string): void {
    this.serverUrl = serverUrl;
    this.startPinging();

    // Initial check
    if (navigator.onLine) {
      this.checkServerReachability();
    }
  }

  /**
   * Stop the service and clear intervals
   */
  public destroy(): void {
    this.stopPinging();
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
    this.checkServerReachability();
    this.startPinging();
  };

  /**
   * Handle browser offline event
   */
  private handleOffline = (): void => {
    logger.log('[OfflineDetection] Browser is offline');
    this.isOnline.value = false;
    this.serverReachable.value = false;
    this.stopPinging();
  };

  /**
   * Start periodic server ping
   */
  private startPinging(): void {
    if (this.pingInterval) {
      return; // Already pinging
    }

    this.pingInterval = window.setInterval(() => {
      if (this.isOnline.value) {
        this.checkServerReachability();
      }
    }, this.PING_INTERVAL_MS);
  }

  /**
   * Stop periodic server ping
   */
  private stopPinging(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Check if Jellyfin server is reachable
   */
  private async checkServerReachability(): Promise<void> {
    if (!this.serverUrl) {
      this.serverReachable.value = false;
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.PING_TIMEOUT_MS);

      // Ping the server's system info endpoint (lightweight)
      const response = await fetch(`${this.serverUrl}/System/Info/Public`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const wasReachable = this.serverReachable.value;
      this.serverReachable.value = response.ok;

      if (!wasReachable && this.serverReachable.value) {
        logger.log('[OfflineDetection] Server is now reachable');
      } else if (wasReachable && !this.serverReachable.value) {
        logger.log('[OfflineDetection] Server is now unreachable');
      }
    } catch (error) {
      const wasReachable = this.serverReachable.value;
      this.serverReachable.value = false;

      if (wasReachable) {
        logger.log('[OfflineDetection] Server ping failed:', error);
      }
    }
  }

  /**
   * Manually trigger a server reachability check
   */
  public async checkNow(): Promise<boolean> {
    await this.checkServerReachability();
    return this.serverReachable.value;
  }

  /**
   * Get the combined online status (browser online AND server reachable)
   */
  public get isFullyOnline(): boolean {
    return this.isOnline.value && this.serverReachable.value;
  }
}

// Export singleton instance
export const offlineDetection = OfflineDetectionService.getInstance();
