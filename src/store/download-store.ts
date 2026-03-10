import { defineStore } from 'pinia';
import { downloadService } from '@/services/downloadService';
import { useOfflineStore } from './offline-store';
import { useJellyfinStore } from './jellyfin-store';

export interface DownloadTask {
  itemId: string;
  name: string;
  type: 'Movie' | 'Episode' | 'Audio' | 'MusicAlbum';
  progress: number;
  loaded: number;
  total: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  startedAt: number;
}

interface DownloadStoreState {
  tasks: Map<string, DownloadTask>;
  showIndicator: boolean;
}

export const useDownloadStore = defineStore('downloads', {
  state: (): DownloadStoreState => ({
    tasks: new Map(),
    showIndicator: false,
  }),

  getters: {
    activeDownloads(): DownloadTask[] {
      return Array.from(this.tasks.values()).filter(
        (t) => t.status === 'downloading' || t.status === 'queued'
      );
    },

    completedDownloads(): DownloadTask[] {
      return Array.from(this.tasks.values()).filter((t) => t.status === 'completed');
    },

    hasActiveDownloads(): boolean {
      return this.activeDownloads.length > 0;
    },

    currentDownload(): DownloadTask | null {
      return this.activeDownloads.find((t) => t.status === 'downloading') || null;
    },

    totalProgress(): number {
      const active = this.activeDownloads;
      if (active.length === 0) return 0;
      const totalLoaded = active.reduce((sum, t) => sum + t.loaded, 0);
      const totalSize = active.reduce((sum, t) => sum + t.total, 0);
      return totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0;
    },

    isDownloading:
      (state) =>
      (itemId: string): boolean => {
        const task = state.tasks.get(itemId);
        return task?.status === 'downloading' || task?.status === 'queued';
      },

    getTask:
      (state) =>
      (itemId: string): DownloadTask | undefined => {
        return state.tasks.get(itemId);
      },
  },

  actions: {
    async startDownload(itemId: string, metadata: any) {
      // Check if already downloading
      if (this.tasks.get(itemId)?.status === 'downloading') {
        console.log('[DownloadStore] Already downloading:', itemId);
        return;
      }

      const jellyfinStore = useJellyfinStore();
      if (!jellyfinStore.serverUrl || !jellyfinStore.accessToken) {
        throw new Error('Not connected to server');
      }

      // Create task
      const task: DownloadTask = {
        itemId,
        name: metadata.Name || 'Unknown',
        type: metadata.Type,
        progress: 0,
        loaded: 0,
        total: 0,
        status: 'downloading',
        startedAt: Date.now(),
      };

      this.tasks.set(itemId, task);
      this.showIndicator = true;

      try {
        await downloadService.downloadForOffline(
          jellyfinStore.serverUrl,
          itemId,
          jellyfinStore.accessToken,
          metadata,
          (progress) => {
            const t = this.tasks.get(itemId);
            if (t) {
              t.progress = progress.percentage;
              t.loaded = progress.loaded;
              t.total = progress.total;
            }
          }
        );

        // Mark as completed
        const t = this.tasks.get(itemId);
        if (t) {
          t.status = 'completed';
          t.progress = 100;
        }

        // Refresh offline store
        const offlineStore = useOfflineStore();
        await offlineStore.loadDownloads();

        console.log('[DownloadStore] Download completed:', metadata.Name);
      } catch (error: any) {
        const t = this.tasks.get(itemId);
        if (t) {
          if (error.name === 'AbortError') {
            t.status = 'cancelled';
          } else {
            t.status = 'failed';
            t.error = error.message || 'Download failed';
          }
        }
        throw error;
      }
    },

    cancelDownload(itemId: string) {
      downloadService.cancelDownload(itemId);
      const task = this.tasks.get(itemId);
      if (task) {
        task.status = 'cancelled';
      }
    },

    removeTask(itemId: string) {
      this.tasks.delete(itemId);
      if (this.tasks.size === 0) {
        this.showIndicator = false;
      }
    },

    clearCompleted() {
      for (const [id, task] of this.tasks) {
        if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
          this.tasks.delete(id);
        }
      }
      if (this.tasks.size === 0) {
        this.showIndicator = false;
      }
    },

    toggleIndicator() {
      this.showIndicator = !this.showIndicator;
    },
  },
});
