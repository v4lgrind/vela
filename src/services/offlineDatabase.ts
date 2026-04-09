/**
 * Offline Database Service
 *
 * IndexedDB wrapper for storing downloaded media metadata and watch progress.
 * Provides a structured interface for offline content management.
 */

export interface DownloadedMedia {
  itemId: string; // Primary key
  type: "Movie" | "Episode" | "MusicAlbum" | "Audio";
  name: string;
  filePath: string;
  fileSize: number;
  downloadDate: number; // timestamp

  // Organization metadata
  seriesId?: string; // For episodes
  seriesName?: string;
  seasonId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  albumId?: string; // For music tracks
  albumName?: string;

  // Cached Jellyfin item for details page
  jellyfinItem: any; // Full item object

  // Sidecar subtitle file for transcoded downloads
  subtitleFilePath?: string;
  subtitleLabel?: string;
  subtitleLanguage?: string;

  // Intro/outro segment timestamps for offline skip-intro support
  introSegments?: Array<{ Type: string; StartTicks: number; EndTicks: number }>;
}

export interface WatchProgress {
  itemId: string; // Primary key
  position: number; // seconds
  duration: number;
  percentage: number;
  completed: boolean;
  lastWatched: number; // timestamp
  synced: boolean; // Synced to Jellyfin?
}

class OfflineDatabase {
  private static instance: OfflineDatabase;
  private db: IDBDatabase | null = null;
  private _initPromise: Promise<void> | null = null;
  private readonly DB_NAME = "JellyfinOffline";
  private readonly DB_VERSION = 1;

  private constructor() {}

  public static getInstance(): OfflineDatabase {
    if (!OfflineDatabase.instance) {
      OfflineDatabase.instance = new OfflineDatabase();
    }
    return OfflineDatabase.instance;
  }

  /**
   * Initialize the database. Idempotent — safe to call multiple times or
   * concurrently; the underlying IDBDatabase is only opened once.
   */
  public async init(): Promise<void> {
    if (this.db) return;
    if (this._initPromise) return this._initPromise;

    if (typeof indexedDB === "undefined") {
      console.warn("[OfflineDB] IndexedDB not available on this platform");
      return;
    }

    this._initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error("[OfflineDB] Failed to open database:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log("[OfflineDB] Database initialized");
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains("downloads")) {
          const downloadsStore = db.createObjectStore("downloads", {
            keyPath: "itemId",
          });
          downloadsStore.createIndex("type", "type", { unique: false });
          downloadsStore.createIndex("seriesId", "seriesId", { unique: false });
          downloadsStore.createIndex("seasonId", "seasonId", { unique: false });
          downloadsStore.createIndex("downloadDate", "downloadDate", {
            unique: false,
          });
          downloadsStore.createIndex("albumId", "albumId", { unique: false });
          console.log("[OfflineDB] Created downloads object store");
        }

        if (!db.objectStoreNames.contains("watchProgress")) {
          const progressStore = db.createObjectStore("watchProgress", {
            keyPath: "itemId",
          });
          progressStore.createIndex("synced", "synced", { unique: false });
          progressStore.createIndex("lastWatched", "lastWatched", {
            unique: false,
          });
          console.log("[OfflineDB] Created watchProgress object store");
        }
      };
    });

    return this._initPromise;
  }

  /**
   * Lazily initialises the database and returns it.
   * Every public method calls this — no explicit init() needed by callers.
   */
  private async ensureDB(): Promise<IDBDatabase> {
    await this.init();
    if (!this.db) throw new Error("IndexedDB unavailable");
    return this.db;
  }

  // ==================== Downloads ====================

  public async addDownload(media: DownloadedMedia): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readwrite");
      const store = transaction.objectStore("downloads");

      media.jellyfinItem = JSON.parse(JSON.stringify(media.jellyfinItem));
      const request = store.put(media);

      request.onsuccess = () => {
        console.log("[OfflineDB] Added download:", media.itemId);
        resolve();
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to add download:", request.error);
        reject(request.error);
      };
    });
  }

  public async getDownload(itemId: string): Promise<DownloadedMedia | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readonly");
      const store = transaction.objectStore("downloads");
      const request = store.get(itemId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to get download:", request.error);
        reject(request.error);
      };
    });
  }

  public async getAllDownloads(): Promise<DownloadedMedia[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readonly");
      const store = transaction.objectStore("downloads");
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to get all downloads:", request.error);
        reject(request.error);
      };
    });
  }

  public async getDownloadsByType(
    type: DownloadedMedia["type"],
  ): Promise<DownloadedMedia[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readonly");
      const store = transaction.objectStore("downloads");
      const request = store.index("type").getAll(type);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to get downloads by type:", request.error);
        reject(request.error);
      };
    });
  }

  public async getDownloadsBySeries(
    seriesId: string,
  ): Promise<DownloadedMedia[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readonly");
      const store = transaction.objectStore("downloads");
      const request = store.index("seriesId").getAll(seriesId);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to get downloads by series:", request.error);
        reject(request.error);
      };
    });
  }

  public async getDownloadsBySeason(
    seasonId: string,
  ): Promise<DownloadedMedia[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readonly");
      const store = transaction.objectStore("downloads");
      const request = store.index("seasonId").getAll(seasonId);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to get downloads by season:", request.error);
        reject(request.error);
      };
    });
  }

  public async getDownloadsByAlbum(
    albumId: string,
  ): Promise<DownloadedMedia[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readonly");
      const store = transaction.objectStore("downloads");
      const request = store.index("albumId").getAll(albumId);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to get downloads by album:", request.error);
        reject(request.error);
      };
    });
  }

  public async isDownloaded(itemId: string): Promise<boolean> {
    const download = await this.getDownload(itemId);
    return download !== null;
  }

  public async deleteDownload(itemId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readwrite");
      const store = transaction.objectStore("downloads");
      const request = store.delete(itemId);

      request.onsuccess = () => {
        console.log("[OfflineDB] Deleted download:", itemId);
        resolve();
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to delete download:", request.error);
        reject(request.error);
      };
    });
  }

  // ==================== Watch Progress ====================

  public async saveWatchProgress(progress: WatchProgress): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["watchProgress"], "readwrite");
      const store = transaction.objectStore("watchProgress");
      const request = store.put(progress);

      request.onsuccess = () => {
        console.log("[OfflineDB] Saved watch progress:", progress.itemId);
        resolve();
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to save watch progress:", request.error);
        reject(request.error);
      };
    });
  }

  public async getWatchProgress(itemId: string): Promise<WatchProgress | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["watchProgress"], "readonly");
      const store = transaction.objectStore("watchProgress");
      const request = store.get(itemId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to get watch progress:", request.error);
        reject(request.error);
      };
    });
  }

  public async getUnsyncedProgress(): Promise<WatchProgress[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["watchProgress"], "readonly");
      const store = transaction.objectStore("watchProgress");
      const request = store.getAll();

      request.onsuccess = () => {
        const all: WatchProgress[] = request.result || [];
        resolve(all.filter(p => !p.synced));
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to get unsynced progress:", request.error);
        reject(request.error);
      };
    });
  }

  public async markProgressSynced(itemId: string): Promise<void> {
    const progress = await this.getWatchProgress(itemId);
    if (progress) {
      progress.synced = true;
      await this.saveWatchProgress(progress);
    }
  }

  public async deleteWatchProgress(itemId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["watchProgress"], "readwrite");
      const store = transaction.objectStore("watchProgress");
      const request = store.delete(itemId);

      request.onsuccess = () => {
        console.log("[OfflineDB] Deleted watch progress:", itemId);
        resolve();
      };

      request.onerror = () => {
        console.error("[OfflineDB] Failed to delete watch progress:", request.error);
        reject(request.error);
      };
    });
  }

  public async clearAll(): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        ["downloads", "watchProgress"],
        "readwrite",
      );

      transaction.objectStore("downloads").clear();
      transaction.objectStore("watchProgress").clear();

      transaction.oncomplete = () => {
        console.log("[OfflineDB] Cleared all data");
        resolve();
      };

      transaction.onerror = () => {
        console.error("[OfflineDB] Failed to clear data:", transaction.error);
        reject(transaction.error);
      };
    });
  }
}

// Export singleton instance
export const offlineDatabase = OfflineDatabase.getInstance();
