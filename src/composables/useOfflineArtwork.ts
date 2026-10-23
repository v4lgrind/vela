import { ref } from 'vue';

import { downloadService } from '@/services/downloadService';
import { useOfflineStore } from '@/store/offline-store';

/**
 * Artwork cached with downloads: `preload` looks the images up once, then
 * `artworkUrl` returns the local copy, else the server URL while online.
 */
export function useOfflineArtwork() {
  const offlineStore = useOfflineStore();
  const cached = ref(new Map<string, string>());
  const looked = new Set<string>();

  async function preload(ids: string[]) {
    const fresh = [...new Set(ids)].filter((id) => id && !looked.has(id));
    fresh.forEach((id) => looked.add(id));
    const found = await Promise.all(fresh.map(async (id) => [id, await downloadService.getCachedImageUrl(id)] as const));
    if (!found.some(([, url]) => url)) return;
    const next = new Map(cached.value);
    for (const [id, url] of found) if (url) next.set(id, url);
    cached.value = next;
  }

  function artworkUrl(id: string | undefined | null, fallback: string): string {
    const local = id ? cached.value.get(id) : undefined;
    if (local) return local;
    return offlineStore.isFullyOnline ? fallback : '';
  }

  return { artworkUrl, preload };
}
