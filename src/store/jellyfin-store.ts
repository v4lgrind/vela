import { markRaw, type Raw } from "vue";
import { defineStore } from "pinia";
import { Api, Jellyfin } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models/base-item-dto";
import {
  getLibraryApi,
  getUserDataApi,
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


    async markPlayed(itemId: string) {
      this.initializeApi();
      await getUserDataApi(this.api).markPlayedItem({
        itemId,
        userId: this.userId!,
      });
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
