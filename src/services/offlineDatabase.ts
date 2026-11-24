import type { Marker, MediaItem } from '@/domain';
import { logger } from '@/utils/logger';

/**
 * Offline Database Service
 *
 * IndexedDB wrapper for storing downloaded media metadata and watch progress.
 * Provides a structured interface for offline content management.
 */

/** A downloaded item as the app uses it: always a domain snapshot and its server. */
export interface DownloadedMedia {
  itemId: string; // Primary key
  /** Storage tag kept from the first schema ("Movie" | "Episode" | "MusicAlbum" | "Audio"). */
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
  libraryId?: string; // Library holding the item; backfilled while online

  /** Server the item was downloaded from (ids are only unique within a server). */
  serverId: string;
  /** Domain snapshot for offline pages and playback. */
  item: MediaItem;

  // Sidecar subtitle file for transcoded downloads
  subtitleFilePath?: string;
  subtitleLabel?: string;
  subtitleLanguage?: string;

  /** Intro/credits markers for offline skip-intro. */
  markers: Marker[];
}

/**
 * A record as stored in IndexedDB. Records written before the multi-backend
 * model only have the Jellyfin DTO and its segments; `normalizeDownload`
 * (utils/offlineRecords) turns any record into a `DownloadedMedia`.
 */
export interface StoredDownload extends Omit<DownloadedMedia, 'serverId' | 'item' | 'markers'> {
  serverId?: string;
  item?: MediaItem;
  markers?: Marker[];
  /** @deprecated pre-domain records: Jellyfin BaseItemDto, kept until a later release. */
  jellyfinItem?: any;
  /** @deprecated pre-domain records: Jellyfin media segments in ticks. */
  introSegments?: Array<{ Type: string; StartTicks: number; EndTicks: number }>;
}

const STORAGE_TYPE: Partial<Record<MediaItem['kind'], DownloadedMedia['type']>> = {
  movie: 'Movie', episode: 'Episode', track: 'Audio', album: 'MusicAlbum',
};

/**
 * Build a download record from a domain item, filling in the series/album
 * organization fields for episodes and music tracks.
 * Shared by the download service and the native-download reconciliation.
 */
export function buildDownloadedMedia(
  item: MediaItem,
  serverId: string,
  filePath: string,
  fileSize: number,
  markers: Marker[] = [],
): DownloadedMedia {
  const media: DownloadedMedia = {
    itemId: item.id,
    type: STORAGE_TYPE[item.kind] ?? 'Movie',
    name: item.title || 'Unknown',
    filePath,
    fileSize,
    downloadDate: Date.now(),
    serverId,
    item,
    markers,
  };
  if (item.kind === 'episode') {
    Object.assign(media, {
      seriesId: item.seriesId, seriesName: item.seriesTitle, seasonId: item.seasonId,
      seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber,
    });
  } else if (item.kind === 'track') {
    Object.assign(media, { albumId: item.albumId, albumName: item.albumTitle });
  }
  return media;
}

export interface WatchProgress {
  itemId: string; // Primary key
  position: number; // seconds
  duration: number;
  percentage: number;
  completed: boolean;
  lastWatched: number; // timestamp
  synced: boolean; // Pushed to the server?
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
      logger.warn("[OfflineDB] IndexedDB not available on this platform");
      return;
    }

    this._initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        logger.error("[OfflineDB] Failed to open database:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        logger.log("[OfflineDB] Database initialized");
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
          logger.log("[OfflineDB] Created downloads object store");
        }

        if (!db.objectStoreNames.contains("watchProgress")) {
          const progressStore = db.createObjectStore("watchProgress", {
            keyPath: "itemId",
          });
          progressStore.createIndex("synced", "synced", { unique: false });
          progressStore.createIndex("lastWatched", "lastWatched", {
            unique: false,
          });
          logger.log("[OfflineDB] Created watchProgress object store");
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

  public async addDownload(media: StoredDownload): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readwrite");
      const store = transaction.objectStore("downloads");

      // Plain copy: records taken from the Pinia store carry reactive proxies
      // (item, markers) that IndexedDB cannot clone.
      const request = store.put(JSON.parse(JSON.stringify(media)));

      request.onsuccess = () => {
        logger.log("[OfflineDB] Added download:", media.itemId);
        resolve();
      };

      request.onerror = () => {
        logger.error("[OfflineDB] Failed to add download:", request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Merge `patch` into a stored record in one transaction. Does nothing (false)
   * when the record is gone, so background updates never bring back a
   * download deleted meanwhile.
   */
  public async patchDownload(itemId: string, patch: Partial<StoredDownload>): Promise<boolean> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readwrite");
      const store = transaction.objectStore("downloads");
      const read = store.get(itemId);
      read.onsuccess = () => {
        if (!read.result) {
          resolve(false);
          return;
        }
        const write = store.put({ ...read.result, ...JSON.parse(JSON.stringify(patch)) });
        write.onsuccess = () => resolve(true);
        write.onerror = () => reject(write.error);
      };
      read.onerror = () => reject(read.error);
    });
  }

  public async getDownload(itemId: string): Promise<StoredDownload | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readonly");
      const store = transaction.objectStore("downloads");
      const request = store.get(itemId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        logger.error("[OfflineDB] Failed to get download:", request.error);
        reject(request.error);
      };
    });
  }

  public async getAllDownloads(): Promise<StoredDownload[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readonly");
      const store = transaction.objectStore("downloads");
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        logger.error("[OfflineDB] Failed to get all downloads:", request.error);
        reject(request.error);
      };
    });
  }

  /** Shared reader for all "downloads by <index>" queries. */
  private async getDownloadsByIndex(
    indexName: "type" | "seriesId" | "seasonId" | "albumId",
    value: string,
  ): Promise<StoredDownload[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["downloads"], "readonly");
      const store = transaction.objectStore("downloads");
      const request = store.index(indexName).getAll(value);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        logger.error(`[OfflineDB] Failed to get downloads by ${indexName}:`, request.error);
        reject(request.error);
      };
    });
  }

  public async getDownloadsByType(
    type: DownloadedMedia["type"],
  ): Promise<StoredDownload[]> {
    return this.getDownloadsByIndex("type", type);
  }

  public async getDownloadsBySeries(
    seriesId: string,
  ): Promise<StoredDownload[]> {
    return this.getDownloadsByIndex("seriesId", seriesId);
  }

  public async getDownloadsBySeason(
    seasonId: string,
  ): Promise<StoredDownload[]> {
    return this.getDownloadsByIndex("seasonId", seasonId);
  }

  public async getDownloadsByAlbum(
    albumId: string,
  ): Promise<StoredDownload[]> {
    return this.getDownloadsByIndex("albumId", albumId);
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
        logger.log("[OfflineDB] Deleted download:", itemId);
        resolve();
      };

      request.onerror = () => {
        logger.error("[OfflineDB] Failed to delete download:", request.error);
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
        logger.log("[OfflineDB] Saved watch progress:", progress.itemId);
        resolve();
      };

      request.onerror = () => {
        logger.error("[OfflineDB] Failed to save watch progress:", request.error);
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
        logger.error("[OfflineDB] Failed to get watch progress:", request.error);
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
        logger.error("[OfflineDB] Failed to get unsynced progress:", request.error);
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
        logger.log("[OfflineDB] Deleted watch progress:", itemId);
        resolve();
      };

      request.onerror = () => {
        logger.error("[OfflineDB] Failed to delete watch progress:", request.error);
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
        logger.log("[OfflineDB] Cleared all data");
        resolve();
      };

      transaction.onerror = () => {
        logger.error("[OfflineDB] Failed to clear data:", transaction.error);
        reject(transaction.error);
      };
    });
  }
}

// Export singleton instance
export const offlineDatabase = OfflineDatabase.getInstance();
