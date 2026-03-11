import { defineStore } from 'pinia';

/**
 * Lightweight cache for Series and Season item metadata.
 * Populated when episodes are downloaded so that their parent
 * Series/Season detail pages work without a network connection.
 *
 * Only stores the fields needed to render the detail page —
 * keeps localStorage usage small (≈2–5 KB per entry).
 */
export interface CachedItem {
  Id: string;
  Name: string;
  Type: string;
  Overview?: string;
  Genres?: string[];
  ProductionYear?: number;
  CommunityRating?: number;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  SeriesId?: string;
  SeriesName?: string;
  IndexNumber?: number;
  Studios?: Array<{ Name: string }>;
  People?: Array<{ Id?: string; Name: string; Role?: string; Type?: string; PrimaryImageTag?: string }>;
}

export const useMetadataCacheStore = defineStore('metadataCache', {
  state: () => ({
    cache: {} as Record<string, CachedItem>,
  }),

  persist: true,

  actions: {
    set(item: any) {
      if (!item?.Id) return;
      // Only persist what the detail page actually needs
      const slim: CachedItem = {
        Id: item.Id,
        Name: item.Name,
        Type: item.Type,
        Overview: item.Overview,
        Genres: item.Genres,
        ProductionYear: item.ProductionYear,
        CommunityRating: item.CommunityRating,
        ImageTags: item.ImageTags,
        BackdropImageTags: item.BackdropImageTags,
        SeriesId: item.SeriesId,
        SeriesName: item.SeriesName,
        IndexNumber: item.IndexNumber,
        Studios: item.Studios?.map((s: any) => ({ Name: s.Name })),
        People: item.People?.slice(0, 20), // cap cast list size
      };
      this.cache[item.Id] = slim;
    },

    get(id: string): CachedItem | null {
      return this.cache[id] ?? null;
    },

    has(id: string): boolean {
      return id in this.cache;
    },
  },
});
