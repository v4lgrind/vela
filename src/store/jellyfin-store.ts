import { markRaw, type Raw } from "vue";
import { defineStore } from "pinia";
import { Api, Jellyfin } from "@jellyfin/sdk";
import type { LibraryApiGetItemsRequest } from "@jellyfin/sdk/lib/generated-client";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models/base-item-dto";
import {
  getLibraryApi,
  getUserDataApi,
  getShowApi,
  getUserViewApi,
  getArtistApi,
  getLyricApi,
} from "@jellyfin/sdk/lib/utils/api";

import { CLIENT_IDENTITY, useSessionStore } from "./session-store";

function createJellyfinClient(deviceId: string): Jellyfin {
  return new Jellyfin({
    clientInfo: { name: CLIENT_IDENTITY.product, version: CLIENT_IDENTITY.version },
    deviceInfo: { name: CLIENT_IDENTITY.deviceName, id: deviceId },
  });
}

/** The active Jellyfin connection, or null while signed out or on another server kind. */
function activeJellyfin() {
  const session = useSessionStore();
  return session.active?.kind === "jellyfin" ? session.active : null;
}

interface State {
  libraries: any[];
  items: any[];
  api: Raw<Api>;
  currentItem: any | null;
}

export const useJellyfinStore = defineStore("jellyfin", {
  state: (): State => ({
    libraries: [],
    items: [],
    api: markRaw({} as Api),
    currentItem: null,
  }),
  persist: {
    // libraries: remembered so the offline library list shows the real ones.
    pick: ['libraries'],
  },
  actions: {
    initializeApi() {
      const connection = activeJellyfin();
      if (!connection || !this.accessToken) return;
      this.api = markRaw(createJellyfinClient(connection.deviceId).createApi(this.serverUrl, this.accessToken));
    },
    /** Drops data cached for the previous account (called when the active connection changes). */
    resetSessionData() {
      this.libraries = [];
      this.items = [];
      this.currentItem = null;
    },
    async fetchLibraries() {
      this.initializeApi();
      const views = await getUserViewApi(this.api).getUserViews({
        userId: this.userId!,
      });

      const Items = views.data.Items?.filter(
        (library) => library.CollectionType !== "playlists"
      ) || [];
      this.libraries = Items;
      return Items;
    },
    async fetchItems(
      libraryId: string,
      options?: {
        startIndex?: number;
        limit?: number;
        sortBy?: string[];
        sortOrder?: string[];
        filters?: string[];
        genres?: string[];
        nameStartsWith?: string;
        includeItemTypes?: string[];
      }
    ) {
      this.initializeApi();

      const apiParams: LibraryApiGetItemsRequest = {
        userId: this.userId,
        parentId: libraryId,
        recursive: true,
        includeItemTypes: (options?.includeItemTypes ?? ["Movie", "Series", "MusicAlbum", "BoxSet"]) as LibraryApiGetItemsRequest["includeItemTypes"],
        sortBy: (options?.sortBy ?? ["SortName"]) as LibraryApiGetItemsRequest["sortBy"],
        sortOrder: (options?.sortOrder ?? ["Ascending"]) as LibraryApiGetItemsRequest["sortOrder"],
        startIndex: options?.startIndex ?? 0,
        limit: options?.limit ?? 48,
        filters: options?.filters as LibraryApiGetItemsRequest["filters"],
        genres: options?.genres,
        nameStartsWith: options?.nameStartsWith || undefined,
      };

      const resp = await getLibraryApi(this.api).getItems(apiParams);
      this.items = resp.data.Items || [];
      return { items: this.items, total: resp.data.TotalRecordCount ?? this.items.length };
    },


    /** Items by id, with their user data (100 ids per request). */
    async fetchItemsByIds(ids: string[]): Promise<BaseItemDto[]> {
      this.initializeApi();
      const items: BaseItemDto[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const resp = await getLibraryApi(this.api).getItems({
          userId: this.userId,
          ids: ids.slice(i, i + 100),
          recursive: true,
          enableUserData: true,
        });
        items.push(...(resp.data.Items ?? []));
      }
      return items;
    },

    async fetchGenres(libraryId: string) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        parentId: libraryId,
        recursive: true,
        includeItemTypes: ["Movie", "Series", "MusicAlbum", "BoxSet"],
        fields: ["Genres"] as any,
        limit: 1000,
      });

      // Extract unique genres from all items
      const genresSet = new Set<string>();
      resp.data.Items?.forEach((item: any) => {
        if (item.Genres) {
          item.Genres.forEach((genre: string) => genresSet.add(genre));
        }
      });

      return Array.from(genresSet).sort();
    },
    getImageUrl(
      itemId: string,
      imageType: string = "Primary",
      width?: number,
      height?: number
    ) {
      let url = this.serverUrl + `/Items/${itemId}/Images/${imageType}`;
      const params = new URLSearchParams();
      if (width) params.set("maxWidth", width.toString());
      if (height) params.set("maxHeight", height.toString());
      params.set("quality", "80");
      url += `?${params.toString()}`;
      return url;
    },
    async fetchItemDetails(itemId: string) {
      this.initializeApi();

      // Use getItems with explicit fields — fetching an item alone does not expose
      // enableUserData or fields params, so UserData and MediaStreams can be missing
      // on some Jellyfin versions, causing resume position and audio track to be lost.
      const resp = await getLibraryApi(this.api).getItems({
        ids: [itemId],
        userId: this.userId,
        fields: ['MediaStreams', 'UserData', 'People', 'Overview', 'Genres', 'Studios', 'MediaSources', 'Trickplay'] as any,
        enableUserData: true,
      });
      const item = resp.data.Items?.[0];
      if (!item) throw new Error(`Item not found: ${itemId}`);
      this.currentItem = item;
      return this.currentItem;
    },



    async fetchSeasons(seriesId: string) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        parentId: seriesId,
        includeItemTypes: ["Season"] as any,
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
      });
      return resp.data.Items ?? [];
    },

    async fetchEpisodes(seasonId: string) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        parentId: seasonId,
        includeItemTypes: ["Episode"] as any,
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        fields: ["Overview", "PrimaryImageAspectRatio", "CommunityRating", "PremiereDate", "UserData", "MediaStreams", "MediaSources"] as any,
      });
      return resp.data.Items ?? [];
    },

    async fetchAllSeriesEpisodes(seriesId: string) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        seriesId,
        includeItemTypes: ["Episode"] as any,
        sortBy: ["ParentIndexNumber", "IndexNumber"],
        sortOrder: ["Ascending"],
        fields: ["Overview", "UserData", "MediaSources"] as any,
        recursive: true,
      } as any);
      return resp.data.Items ?? [];
    },

    async markPlayed(itemId: string) {
      this.initializeApi();
      await getUserDataApi(this.api).markPlayedItem({
        itemId,
        userId: this.userId!,
      });
    },

    async markUnplayed(itemId: string) {
      this.initializeApi();
      await getUserDataApi(this.api).markUnplayedItem({
        itemId,
        userId: this.userId!,
      });
    },

    async fetchNextUp(seriesId: string) {
      this.initializeApi();
      const resp = await getShowApi(this.api).getNextUp({
        userId: this.userId,
        seriesId,
        limit: 1,
      });
      return resp.data.Items?.[0] ?? null;
    },


    async fetchFirstUnwatchedEpisode(seasonId: string) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        parentId: seasonId,
        includeItemTypes: ["Episode"] as any,
        sortBy: ["IndexNumber"],
        sortOrder: ["Ascending"],
        filters: ["IsUnplayed"] as any,
        limit: 1,
      });
      return resp.data.Items?.[0] ?? null;
    },

    async fetchFirstEpisode(seasonId: string) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        parentId: seasonId,
        includeItemTypes: ["Episode"] as any,
        sortBy: ["IndexNumber"],
        sortOrder: ["Ascending"],
        limit: 1,
      });
      return resp.data.Items?.[0] ?? null;
    },




    async fetchSimilarItems(itemId: string, limit = 12) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getSimilarItems({
        itemId,
        userId: this.userId,
        limit,
        fields: ['Overview'] as any,
      });
      return resp.data.Items ?? [];
    },

    /** Same paging/sorting options as fetchItems, for a music library's artists. */
    async fetchAlbumArtists(
      libraryId: string,
      options: { startIndex: number; limit: number; sortOrder: string[]; filters?: string[]; genres?: string[]; nameStartsWith?: string }
    ) {
      this.initializeApi();
      const resp = await getArtistApi(this.api).getAlbumArtists({
        userId: this.userId,
        parentId: libraryId,
        startIndex: options.startIndex,
        limit: options.limit,
        sortBy: ["SortName"],
        sortOrder: options.sortOrder as any,
        filters: options.filters as any,
        genres: options.genres,
        nameStartsWith: options.nameStartsWith,
        enableUserData: true,
      });
      const items = resp.data.Items ?? [];
      return { items, total: resp.data.TotalRecordCount ?? items.length };
    },
    /** The user's audio playlists (they live outside the music library). */
    async fetchAudioPlaylists(options: { startIndex: number; limit: number; sortOrder: string[]; nameStartsWith?: string }) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        recursive: true,
        includeItemTypes: ["Playlist"] as any,
        mediaTypes: ["Audio"] as any,
        startIndex: options.startIndex,
        limit: options.limit,
        sortBy: ["SortName"],
        sortOrder: options.sortOrder as any,
        nameStartsWith: options.nameStartsWith,
      });
      const items = resp.data.Items ?? [];
      return { items, total: resp.data.TotalRecordCount ?? items.length };
    },
    async fetchArtistAlbums(artistId: string) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        recursive: true,
        albumArtistIds: [artistId],
        includeItemTypes: ["MusicAlbum"] as any,
        sortBy: ["ProductionYear", "SortName"] as any,
        sortOrder: ["Descending", "Ascending"] as any,
      });
      return resp.data.Items ?? [];
    },
    async fetchArtistTracks(artistId: string) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        recursive: true,
        artistIds: [artistId],
        includeItemTypes: ["Audio"] as any,
        sortBy: ["ProductionYear", "Album", "ParentIndexNumber", "IndexNumber"] as any,
      });
      return resp.data.Items ?? [];
    },
    /** Random songs from a music library. */
    async fetchRandomTracks(libraryId: string, limit = 300) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        parentId: libraryId,
        recursive: true,
        includeItemTypes: ["Audio"] as any,
        sortBy: ["Random"] as any,
        limit,
      });
      return resp.data.Items ?? [];
    },
    /** Playlist entries in playlist order (no sortBy). */
    async fetchPlaylistTracks(playlistId: string) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        parentId: playlistId,
        includeItemTypes: ["Audio"] as any,
      });
      return resp.data.Items ?? [];
    },
    async fetchAudioTracks(albumId: string) {
      this.initializeApi();
      const resp = await getLibraryApi(this.api).getItems({
        userId: this.userId,
        parentId: albumId,
        includeItemTypes: ["Audio"] as any,
        sortBy: ["ParentIndexNumber", "IndexNumber", "SortName"],
        sortOrder: ["Ascending"],
      });
      return resp.data.Items ?? [];
    },
    /** A track's lyrics; the server answers 404 when it has none. */
    async fetchLyrics(itemId: string) {
      this.initializeApi();
      const resp = await getLyricApi(this.api).getLyrics({ itemId });
      return resp.data;
    },
  },
  getters: {
    // Read-only views of the session, kept while pages still use this store.
    serverUrl: (): string => activeJellyfin()?.baseUrl ?? "",
    userId: (): string => activeJellyfin()?.user.id ?? "",
    accessToken: (): string => (activeJellyfin() ? useSessionStore().token ?? "" : ""),
  },
});
