/**
 * Offline Database Service
 *
 * IndexedDB wrapper for storing downloaded media metadata and watch progress.
 * Provides a structured interface for offline content management.
 */

export interface DownloadedMedia {
  itemId: string;                    // Primary key
  type: 'Movie' | 'Episode' | 'MusicAlbum' | 'Audio';
  name: string;
  filePath: string;                  // Tauri file path
  fileSize: number;
  downloadDate: number;              // timestamp

  // Organization metadata
  seriesId?: string;                 // For episodes
  seriesName?: string;
  seasonId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  albumId?: string;                  // For music tracks
  albumName?: string;

  // Cached Jellyfin item for details page
  jellyfinItem: any;                 // Full item object
}

export interface WatchProgress {
  itemId: string;                    // Primary key
  position: number;                  // seconds
  duration: number;
  percentage: number;
  completed: boolean;
  lastWatched: number;               // timestamp
  synced: boolean;                   // Synced to Jellyfin?
}

class OfflineDatabase {
  private static instance: OfflineDatabase;
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'JellyfinOffline';
  private readonly DB_VERSION = 1;

  private constructor() {}

  public static getInstance(): OfflineDatabase {
    if (!OfflineDatabase.instance) {
      OfflineDatabase.instance = new OfflineDatabase();
    }
    return OfflineDatabase.instance;
  }

  /**
   * Initialize the database
   */
  public async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      console.warn('[OfflineDB] IndexedDB not available on this platform');
      return;
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('[OfflineDB] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[OfflineDB] Database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create downloads object store
        if (!db.objectStoreNames.contains('downloads')) {
          const downloadsStore = db.createObjectStore('downloads', { keyPath: 'itemId' });
          downloadsStore.createIndex('type', 'type', { unique: false });
          downloadsStore.createIndex('seriesId', 'seriesId', { unique: false });
          downloadsStore.createIndex('seasonId', 'seasonId', { unique: false });
          downloadsStore.createIndex('downloadDate', 'downloadDate', { unique: false });
          downloadsStore.createIndex('albumId', 'albumId', { unique: false });
          console.log('[OfflineDB] Created downloads object store');
        }

        // Create watchProgress object store
        if (!db.objectStoreNames.contains('watchProgress')) {
          const progressStore = db.createObjectStore('watchProgress', { keyPath: 'itemId' });
          progressStore.createIndex('synced', 'synced', { unique: false });
          progressStore.createIndex('lastWatched', 'lastWatched', { unique: false });
          console.log('[OfflineDB] Created watchProgress object store');
        }
      };
    });
  }

  /**
   * Ensure database is initialized
   */
  private ensureDB(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  // ==================== Downloads ====================

  /**
   * Add a downloaded media item
   */
  public async addDownload(media: DownloadedMedia): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['downloads'], 'readwrite');
      const store = transaction.objectStore('downloads');

      const request = store.put(media);

      request.onsuccess = () => {
        console.log('[OfflineDB] Added download:', media.itemId);
        resolve();
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to add download:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get a specific downloaded media item
   */
  public async getDownload(itemId: string): Promise<DownloadedMedia | null> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['downloads'], 'readonly');
      const store = transaction.objectStore('downloads');

      const request = store.get(itemId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to get download:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all downloaded media items
   */
  public async getAllDownloads(): Promise<DownloadedMedia[]> {
    if (!this.db) return [];
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['downloads'], 'readonly');
      const store = transaction.objectStore('downloads');

      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to get all downloads:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get downloads by type (Movie, Episode, etc.)
   */
  public async getDownloadsByType(type: DownloadedMedia['type']): Promise<DownloadedMedia[]> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['downloads'], 'readonly');
      const store = transaction.objectStore('downloads');
      const index = store.index('type');

      const request = index.getAll(type);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to get downloads by type:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get downloads for a specific series
   */
  public async getDownloadsBySeries(seriesId: string): Promise<DownloadedMedia[]> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['downloads'], 'readonly');
      const store = transaction.objectStore('downloads');
      const index = store.index('seriesId');

      const request = index.getAll(seriesId);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to get downloads by series:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get downloads for a specific season
   */
  public async getDownloadsBySeason(seasonId: string): Promise<DownloadedMedia[]> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['downloads'], 'readonly');
      const store = transaction.objectStore('downloads');
      const index = store.index('seasonId');

      const request = index.getAll(seasonId);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to get downloads by season:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get downloads for a specific album
   */
  public async getDownloadsByAlbum(albumId: string): Promise<DownloadedMedia[]> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['downloads'], 'readonly');
      const store = transaction.objectStore('downloads');
      const index = store.index('albumId');

      const request = index.getAll(albumId);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to get downloads by album:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Check if an item is downloaded
   */
  public async isDownloaded(itemId: string): Promise<boolean> {
    const download = await this.getDownload(itemId);
    return download !== null;
  }

  /**
   * Delete a downloaded media item
   */
  public async deleteDownload(itemId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['downloads'], 'readwrite');
      const store = transaction.objectStore('downloads');

      const request = store.delete(itemId);

      request.onsuccess = () => {
        console.log('[OfflineDB] Deleted download:', itemId);
        resolve();
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to delete download:', request.error);
        reject(request.error);
      };
    });
  }

  // ==================== Watch Progress ====================

  /**
   * Save watch progress
   */
  public async saveWatchProgress(progress: WatchProgress): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['watchProgress'], 'readwrite');
      const store = transaction.objectStore('watchProgress');

      const request = store.put(progress);

      request.onsuccess = () => {
        console.log('[OfflineDB] Saved watch progress:', progress.itemId);
        resolve();
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to save watch progress:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get watch progress for an item
   */
  public async getWatchProgress(itemId: string): Promise<WatchProgress | null> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['watchProgress'], 'readonly');
      const store = transaction.objectStore('watchProgress');

      const request = store.get(itemId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to get watch progress:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all unsynced watch progress entries
   */
  public async getUnsyncedProgress(): Promise<WatchProgress[]> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['watchProgress'], 'readonly');
      const store = transaction.objectStore('watchProgress');
      const index = store.index('synced');

      const request = index.getAll(IDBKeyRange.only(false));

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to get unsynced progress:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Mark watch progress as synced
   */
  public async markProgressSynced(itemId: string): Promise<void> {
    const progress = await this.getWatchProgress(itemId);
    if (progress) {
      progress.synced = true;
      await this.saveWatchProgress(progress);
    }
  }

  /**
   * Delete watch progress
   */
  public async deleteWatchProgress(itemId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['watchProgress'], 'readwrite');
      const store = transaction.objectStore('watchProgress');

      const request = store.delete(itemId);

      request.onsuccess = () => {
        console.log('[OfflineDB] Deleted watch progress:', itemId);
        resolve();
      };

      request.onerror = () => {
        console.error('[OfflineDB] Failed to delete watch progress:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clear all data (for testing/debugging)
   */
  public async clearAll(): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.ensureDB();
      const transaction = db.transaction(['downloads', 'watchProgress'], 'readwrite');

      const downloadsStore = transaction.objectStore('downloads');
      const progressStore = transaction.objectStore('watchProgress');

      downloadsStore.clear();
      progressStore.clear();

      transaction.oncomplete = () => {
        console.log('[OfflineDB] Cleared all data');
        resolve();
      };

      transaction.onerror = () => {
        console.error('[OfflineDB] Failed to clear data:', transaction.error);
        reject(transaction.error);
      };
    });
  }
}

// Export singleton instance
export const offlineDatabase = OfflineDatabase.getInstance();
