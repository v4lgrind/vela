import { defineStore } from 'pinia';

import type { MediaItem } from '@/domain';

import { useSessionStore } from './session-store';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CREDITS = 20;

/** Entries written before the multi-backend model hold a Jellyfin DTO subset (`Id`, `Name`, …). */
interface LegacyEntry { Id: string; _cachedAt?: number; [field: string]: unknown }
interface CachedEntry { item: MediaItem; cachedAt: number }

function isLegacy(entry: CachedEntry | LegacyEntry): entry is LegacyEntry {
  return 'Id' in entry;
}

/**
 * Lightweight cache for parent items (series, seasons) of downloads, so their
 * detail pages work without a network connection. Credits are capped to keep
 * localStorage small.
 */
export const useMetadataCacheStore = defineStore('metadataCache', {
  state: () => ({
    cache: {} as Record<string, CachedEntry | LegacyEntry>,
  }),

  persist: true,

  actions: {
    set(item: MediaItem | null | undefined) {
      if (!item?.id) return;
      const slim = 'credits' in item ? { ...item, credits: item.credits.slice(0, MAX_CREDITS) } : item;
      this.cache[item.id] = { item: slim as MediaItem, cachedAt: Date.now() };
    },

    get(id: string, allowExpired = false): MediaItem | null {
      const entry = this.cache[id];
      if (!entry) return null;
      const cachedAt = isLegacy(entry) ? entry._cachedAt ?? 0 : entry.cachedAt;
      if (!allowExpired && cachedAt && Date.now() - cachedAt > CACHE_TTL_MS) {
        delete this.cache[id];
        return null;
      }
      if (!isLegacy(entry)) return entry.item;
      // Decoded once, then kept in the current format.
      const item = useSessionStore().decodeStoredItem(entry);
      this.cache[id] = { item, cachedAt };
      return item;
    },

    has(id: string): boolean {
      return this.get(id) !== null;
    },

    pruneExpired() {
      const now = Date.now();
      for (const id in this.cache) {
        const entry = this.cache[id];
        const cachedAt = isLegacy(entry) ? entry._cachedAt ?? 0 : entry.cachedAt;
        if (cachedAt && now - cachedAt > CACHE_TTL_MS) delete this.cache[id];
      }
    },
  },
});
