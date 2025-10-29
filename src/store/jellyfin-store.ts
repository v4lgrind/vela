import { defineStore } from "pinia";
import { Api, Jellyfin } from "@jellyfin/sdk";
import {
  getLibraryApi,
  getItemsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";

interface State {
  serverUrl: string;
  userId: string | undefined;
  libraries: any[];
  items: any[];
  api: Api;
  accessToken: string | null | undefined;
}

export const useJellyfinStore = defineStore("jellyfin", {
  state: (): State => ({
    serverUrl: "",
    userId: "",
    accessToken: "",
    libraries: [],
    items: [],
    api: {} as Api,
  }),
  persist: true,
  actions: {
    initializeApi() {
      if (!this.serverUrl || !this.accessToken) return;
      const jellyfin = new Jellyfin({
        clientInfo: { name: "Client", version: "1.0.0" },
        deviceInfo: { name: "Desktop", id: `dev-${Date.now()}` },
      });

      // Créer l'API avec le token existant
      this.api = jellyfin.createApi(this.serverUrl, this.accessToken);
    },

    async login(serverUrl: string, username: string, password: string) {
      // Initialisation du SDK et création de l'API sans token
      this.serverUrl = serverUrl;
      const jellyfin = new Jellyfin({
        clientInfo: { name: "Client", version: "1.0.0" },
        deviceInfo: { name: "Desktop", id: `dev-${Date.now()}` },
      });
      this.api = jellyfin.createApi(serverUrl);

      // Authentification
      const resp = await this.api.authenticateUserByName(username, password);
      // Enregistrement en localStorage
      this.accessToken = resp.data.AccessToken;
      this.userId = resp.data.User?.Id;

      this.initializeApi();
    },
    async fetchLibraries() {
      this.initializeApi();
      const libraries = await getLibraryApi(this.api).getMediaFolders();

      let Items = libraries.data.Items?.filter(
        (library) => library.CollectionType !== "playlists"
      );
      return Items || [];
    },
    async fetchItems(
      libraryId: string,
      options?: {
        startIndex?: number;
        limit?: number;
      }
    ) {

      this.initializeApi();

      const resp = await getItemsApi(this.api).getItems({
        userId: this.userId,
        parentId: libraryId,
        recursive: true,
        includeItemTypes: ["Movie", "Series", "MusicAlbum", "BoxSet"],
        // Optionnel: tri et pagination
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        startIndex: options?.startIndex ?? 0,
        limit: options?.limit ?? 48,
      });
      this.items = resp.data.Items || [];
      return this.items;
    },
    getImageUrl(
      itemId: string,
      imageType: string = "Primary",
      width?: number,
      height?: number
    ) {
      let url = this.serverUrl + `/Items/${itemId}/Images/${imageType}`;
      if (width || height) {
        const params = new URLSearchParams();
        if (height) params.set("height", height.toString());
        url += `?${params.toString()}`;
      }
      return url;
    },
    logout() {
      this.userId = "";
      this.accessToken = "";
      this.libraries = [];
      this.items = [];
    },
    items: [] as any[],
    currentItem: null as any | null,
    async fetchItemDetails(itemId: string) {
      this.initializeApi();

      // getItem (UserLibraryApi) accepte itemId et userId
      const resp = await getUserLibraryApi(this.api).getItem({
        itemId,
        userId: this.userId,
        // Many endpoints in Jellyfin support "fields" to include extra data
        // La doc du client généré répertorie les noms; on inclut les classiques
        fields: [
          "Overview",
          "Genres",
          "People",
          "CommunityRating",
          "ProductionYear",
          "RunTimeTicks",
          "Studios",
          "Taglines",
          "PremiereDate",
          "MediaStreams",
          "MediaSources",
        ] as any,
      });
      this.currentItem = resp.data;
      return this.currentItem;
    },

    async searchItems(opts: {
      searchTerm: string;
      limit?: number;
      includeItemTypes?: string[];
    }) {
      this.initializeApi();

      if (!this.api || !this.userId) return [];
      const resp = await getItemsApi(this.api).getItems({
        userId: this.userId,
        searchTerm: opts.searchTerm,
        includeItemTypes: opts.includeItemTypes ?? [
          "Movie",
          "Series",
          "Episode",
        ],
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        limit: opts.limit ?? 20,
        recursive: true,
      });
      return resp.data.Items ?? [];
    },

    async fetchSeasons(seriesId: string) {
      this.initializeApi();
      const resp = await getItemsApi(this.api).getItems({
        userId: this.userId,
        parentId: seriesId,
        includeItemTypes: ["Season"],
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        fields: ["Overview", "PrimaryImageAspectRatio"] as any,
      });
      return resp.data.Items ?? [];
    },

    async fetchEpisodes(seasonId: string) {
      this.initializeApi();
      const resp = await getItemsApi(this.api).getItems({
        userId: this.userId,
        parentId: seasonId,
        includeItemTypes: ["Episode"],
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        fields: ["Overview", "RunTimeTicks", "MediaStreams"] as any,
      });
      return resp.data.Items ?? [];
    },

    async fetchAudioTracks(albumId: string) {
      this.initializeApi();
      const resp = await getItemsApi(this.api).getItems({
        userId: this.userId,
        parentId: albumId,
        includeItemTypes: ["Audio"],
        sortBy: ["ParentIndexNumber", "IndexNumber", "SortName"],
        sortOrder: ["Ascending"],
        fields: ["MediaStreams", "RunTimeTicks", "Path"] as any,
      });
      return resp.data.Items ?? [];
    },
    getPlaceholderImage(itemType?: string): string {
      return generatePlaceholderImage(itemType || "default");
    },
  },
  getters: {
    isAuthenticated: (state) => {
      return !!state.accessToken && !!state.userId && !!state.serverUrl;
    },
  },
});

function generatePlaceholderImage(type: string = "default"): string {
  const placeholders: Record<string, string> = {
    movie: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 450'%3E%3Crect fill='%231e1e1e' width='300' height='450'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='%2399aa00' font-family='Arial'%3E🎬%3C/text%3E%3Ctext x='50%25' y='70%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,

    series: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 450'%3E%3Crect fill='%231e1e1e' width='300' height='450'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='%2338f9d7' font-family='Arial'%3E📺%3C/text%3E%3Ctext x='50%25' y='70%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,

    episode: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 112'%3E%3Crect fill='%231e1e1e' width='200' height='112'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='32' fill='%2338f9d7' font-family='Arial'%3E🎞️%3C/text%3E%3Ctext x='50%25' y='75%25' dominant-baseline='middle' text-anchor='middle' font-size='12' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,

    album: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Crect fill='%231e1e1e' width='300' height='300'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='%2343e97b' font-family='Arial'%3E🎵%3C/text%3E%3Ctext x='50%25' y='70%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,

    audio: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 140'%3E%3Crect fill='%231e1e1e' width='140' height='140'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='40' fill='%2343e97b' font-family='Arial'%3E🎵%3C/text%3E%3Ctext x='50%25' y='75%25' dominant-baseline='middle' text-anchor='middle' font-size='12' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,

    person: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 140'%3E%3Crect fill='%231e1e1e' width='140' height='140'/%3E%3Ccircle cx='70' cy='40' r='20' fill='%9aa0a6'/%3E%3Cpath d='M 50 65 Q 50 55 70 55 Q 90 55 90 65 L 90 110 Q 90 120 70 120 Q 50 120 50 110 Z' fill='%9aa0a6'/%3E%3C/svg%3E`,

    default: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 450'%3E%3Crect fill='%231e1e1e' width='300' height='450'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='%239aa0a6' font-family='Arial'%3E❓%3C/text%3E%3Ctext x='50%25' y='70%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,
  };

  return placeholders[type] || placeholders.default;
}
