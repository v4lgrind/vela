import { defineStore } from "pinia";
import { Api, Jellyfin } from "@jellyfin/sdk";
import {
  getLibraryApi,
  getItemsApi,
  getPlaystateApi,
  getTvShowsApi,
  getUserLibraryApi,
  getUserViewsApi,
  getSystemApi,
} from "@jellyfin/sdk/lib/utils/api";
import { Preferences } from "@capacitor/preferences";
import { downloadService } from "../services/downloadService";
import { logger } from "@/utils/logger";

async function getStoredToken(): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: 'jellyfin_access_token' });
    return value;
  } catch {
    return localStorage.getItem('jellyfin_access_token_fallback');
  }
}

async function setStoredToken(token: string | null) {
  try {
    if (token) {
      await Preferences.set({ key: 'jellyfin_access_token', value: token });
    } else {
      await Preferences.remove({ key: 'jellyfin_access_token' });
    }
    localStorage.removeItem('jellyfin_access_token_fallback');
  } catch {
    if (token) {
      localStorage.setItem('jellyfin_access_token_fallback', token);
    } else {
      localStorage.removeItem('jellyfin_access_token_fallback');
    }
  }
}

export interface SavedServer {
  serverUrl: string;
  userId: string;
  accessToken: string;
  userName: string;
  serverName: string;
}

interface State {
  serverUrl: string;
  userId: string | undefined;
  libraries: any[];
  items: any[];
  api: Api;
  accessToken: string | null | undefined;
  downloadProgress: Record<string, number>;
  savedServers: SavedServer[];
  _qcDeviceId: string;
}

export const useJellyfinStore = defineStore("jellyfin", {
  state: (): State => ({
    serverUrl: "",
    userId: "",
    accessToken: "",
    libraries: [],
    items: [],
    api: {} as Api,
    downloadProgress: {} as Record<string, number>,
    savedServers: [],
    _qcDeviceId: '',
  }),
  persist: {
    pick: ['serverUrl', 'savedServers', '_qcDeviceId'],
  },
  actions: {
    async initializeApiAsync() {
      if (!this.serverUrl) return;
      if (!this.accessToken) {
        this.accessToken = await getStoredToken();
      }
      if (!this.accessToken) return;
      this._buildApi();
    },
    _buildApi() {
      if (!this.serverUrl || !this.accessToken) return;
      const jellyfin = new Jellyfin({
        clientInfo: { name: "Client", version: "1.0.0" },
        deviceInfo: { name: "Desktop", id: `dev-${Date.now()}` },
      });
      this.api = jellyfin.createApi(this.serverUrl, this.accessToken);
    },
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
      this.serverUrl = serverUrl;
      const jellyfin = new Jellyfin({
        clientInfo: { name: "Client", version: "1.0.0" },
        deviceInfo: { name: "Desktop", id: `dev-${Date.now()}` },
      });
      this.api = jellyfin.createApi(serverUrl);

      const resp = await this.api.authenticateUserByName(username, password);
      this.accessToken = resp.data.AccessToken;
      this.userId = resp.data.User?.Id;
      await setStoredToken(this.accessToken ?? null);
      this.initializeApi();

      // Persist this server in the saved servers list
      try {
        const infoResp = await getSystemApi(this.api).getPublicSystemInfo();
        const serverName = infoResp.data.ServerName ?? new URL(serverUrl).hostname;
        this._upsertSavedServer({
          serverUrl,
          userId: this.userId!,
          accessToken: this.accessToken!,
          userName: username,
          serverName,
        });
      } catch {
        // Non-fatal: still works without server name
        this._upsertSavedServer({
          serverUrl,
          userId: this.userId!,
          accessToken: this.accessToken!,
          userName: username,
          serverName: new URL(serverUrl).hostname,
        });
      }
    },

    _upsertSavedServer(server: SavedServer) {
      const idx = this.savedServers.findIndex(
        (s) => s.serverUrl === server.serverUrl && s.userId === server.userId
      );
      if (idx >= 0) {
        this.savedServers[idx] = server;
      } else {
        this.savedServers.push(server);
      }
    },

    async switchServer(server: SavedServer) {
      this.serverUrl = server.serverUrl;
      this.userId = server.userId;
      this.accessToken = server.accessToken;
      this.libraries = [];
      this.items = [];
      await setStoredToken(server.accessToken);
      this.initializeApi();
    },

    removeServer(serverUrl: string, userId: string) {
      this.savedServers = this.savedServers.filter(
        (s) => !(s.serverUrl === serverUrl && s.userId === userId)
      );
      if (this.serverUrl === serverUrl && this.userId === userId) {
        this.logout();
      }
    },

    _quickConnectAuthHeader(deviceId: string): string {
      return `MediaBrowser Client="Jellyfin Android", Device="Android", DeviceId="${deviceId}", Version="1.0.0"`;
    },

    async quickConnectInitiate(serverUrl: string) {
      // Generate a stable deviceId for the entire Quick Connect session and store it
      this._qcDeviceId = `jellyfin-android-${Math.random().toString(36).slice(2, 11)}`;
      const resp = await fetch(`${serverUrl}/QuickConnect/Initiate`, {
        method: 'POST',
        headers: {
          'Authorization': this._quickConnectAuthHeader(this._qcDeviceId),
          'Content-Type': 'application/json',
        },
      });
      if (!resp.ok) {
        const err: any = new Error(`Request failed with status code ${resp.status}`);
        err.response = { status: resp.status };
        throw err;
      }
      return resp.json() as Promise<{ Code: string; Secret: string; Authenticated: boolean }>;
    },

    async quickConnectPoll(serverUrl: string, secret: string) {
      const resp = await fetch(`${serverUrl}/QuickConnect/Connect?Secret=${encodeURIComponent(secret)}`, {
        headers: { 'Authorization': this._quickConnectAuthHeader(this._qcDeviceId ?? '') },
      });
      if (!resp.ok) {
        const err: any = new Error(`Request failed with status code ${resp.status}`);
        err.response = { status: resp.status };
        throw err;
      }
      return resp.json() as Promise<{ Authenticated: boolean }>;
    },

    async quickConnectAuthenticate(serverUrl: string, secret: string) {
      this.serverUrl = serverUrl;
      const authHeader = this._quickConnectAuthHeader(this._qcDeviceId ?? '');
      const fetchResp = await fetch(`${serverUrl}/Users/AuthenticateWithQuickConnect`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Secret: secret }),
      });
      if (!fetchResp.ok) {
        const err: any = new Error(`Authentication failed with status code ${fetchResp.status}`);
        err.response = { status: fetchResp.status };
        throw err;
      }
      const data = await fetchResp.json();
      this.accessToken = data.AccessToken;
      this.userId = data.User?.Id;
      await setStoredToken(this.accessToken ?? null);
      this.initializeApi();
      const resp = { data };

      try {
        const infoResp = await getSystemApi(this.api).getPublicSystemInfo();
        const serverName = infoResp.data.ServerName ?? new URL(serverUrl).hostname;
        this._upsertSavedServer({
          serverUrl,
          userId: this.userId!,
          accessToken: this.accessToken!,
          userName: resp.data.User?.Name ?? '',
          serverName,
        });
      } catch {
        this._upsertSavedServer({
          serverUrl,
          userId: this.userId!,
          accessToken: this.accessToken!,
          userName: resp.data.User?.Name ?? '',
          serverName: new URL(serverUrl).hostname,
        });
      }
    },
    async fetchLibraries() {
      this.initializeApi();
      const views = await getUserViewsApi(this.api).getUserViews({
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
      }
    ) {
      this.initializeApi();

      const apiParams: any = {
        userId: this.userId,
        parentId: libraryId,
        recursive: true,
        includeItemTypes: ["Movie", "Series", "MusicAlbum", "BoxSet"] as any,
        sortBy: (options?.sortBy ?? ["SortName"]) as any,
        sortOrder: (options?.sortOrder ?? ["Ascending"]) as any,
        startIndex: options?.startIndex ?? 0,
        limit: options?.limit ?? 48,
        filters: options?.filters as any,
        genres: options?.genres as any,
        nameStartsWith: options?.nameStartsWith || undefined,
      };

      const resp = await getItemsApi(this.api).getItems(apiParams);
      this.items = resp.data.Items || [];
      return this.items;
    },

    async fetchGenres(libraryId: string) {
      this.initializeApi();
      const resp = await getItemsApi(this.api).getItems({
        userId: this.userId,
        parentId: libraryId,
        recursive: true,
        includeItemTypes: ["Movie", "Series", "MusicAlbum", "BoxSet"] as any,
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
    async logout() {
      this.userId = "";
      this.accessToken = "";
      this.libraries = [];
      this.items = [];
      await setStoredToken(null);
    },
    currentItem: null as any | null,
    async fetchItemDetails(itemId: string) {
      this.initializeApi();

      // Use getItems with explicit fields — getUserLibraryApi.getItem does not expose
      // enableUserData or fields params, so UserData and MediaStreams can be missing
      // on some Jellyfin versions, causing resume position and audio track to be lost.
      const resp = await getItemsApi(this.api).getItems({
        ids: [itemId],
        userId: this.userId,
        fields: ['MediaStreams', 'UserData', 'People', 'Overview', 'Genres', 'Studios', 'MediaSources'] as any,
        enableUserData: true,
      });
      const item = resp.data.Items?.[0];
      if (!item) throw new Error(`Item not found: ${itemId}`);
      this.currentItem = item;
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
        includeItemTypes: (opts.includeItemTypes ?? [
          "Movie",
          "Series",
          "Episode",
        ]) as any,
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        limit: opts.limit ?? 20,
        recursive: true,
      });
      return resp.data.Items ?? [];
    },

    async fetchResumeItems(limit = 12) {
      this.initializeApi();
      const resp = await getItemsApi(this.api).getResumeItems({
        userId: this.userId!,
        limit,
        fields: ["Overview", "UserData", "SeriesInfo", "ParentId"] as any,
        includeItemTypes: ["Movie", "Episode"] as any,
        enableImageTypes: ["Backdrop", "Primary", "Thumb"] as any,
        imageTypeLimit: 1,
      });
      return resp.data.Items ?? [];
    },

    async fetchSeasons(seriesId: string) {
      this.initializeApi();
      const resp = await getItemsApi(this.api).getItems({
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
      const resp = await getItemsApi(this.api).getItems({
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
      const resp = await getItemsApi(this.api).getItems({
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
      await getPlaystateApi(this.api).markPlayedItem({
        itemId,
        userId: this.userId!,
      });
    },

    async markUnplayed(itemId: string) {
      this.initializeApi();
      await getPlaystateApi(this.api).markUnplayedItem({
        itemId,
        userId: this.userId!,
      });
    },

    async fetchNextUp(seriesId: string) {
      this.initializeApi();
      const resp = await getTvShowsApi(this.api).getNextUp({
        userId: this.userId,
        seriesId,
        limit: 1,
      });
      return resp.data.Items?.[0] ?? null;
    },

    async fetchAllNextUp(limit = 20) {
      this.initializeApi();
      const resp = await getTvShowsApi(this.api).getNextUp({
        userId: this.userId,
        limit,
        fields: ["PrimaryImageAspectRatio", "SeriesInfo", "ParentId", "UserData"] as any,
        enableImageTypes: ["Primary", "Backdrop", "Thumb"] as any,
        imageTypeLimit: 1,
      });
      return resp.data.Items ?? [];
    },

    async fetchFirstUnwatchedEpisode(seasonId: string) {
      this.initializeApi();
      const resp = await getItemsApi(this.api).getItems({
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
      const resp = await getItemsApi(this.api).getItems({
        userId: this.userId,
        parentId: seasonId,
        includeItemTypes: ["Episode"] as any,
        sortBy: ["IndexNumber"],
        sortOrder: ["Ascending"],
        limit: 1,
      });
      return resp.data.Items?.[0] ?? null;
    },

    async fetchLatestItems(libraryId: string, limit = 10) {
      this.initializeApi();
      const resp = await getUserLibraryApi(this.api).getLatestMedia({
        userId: this.userId!,
        parentId: libraryId,
        limit,
        fields: ['PrimaryImageAspectRatio', 'Overview', 'ProductionYear'] as any,
        enableImageTypes: ['Primary', 'Backdrop', 'Thumb'] as any,
        imageTypeLimit: 1,
      });
      return resp.data ?? [];
    },

    async fetchPersonDetails(personId: string) {
      this.initializeApi();
      const resp = await getItemsApi(this.api).getItems({
        ids: [personId],
        userId: this.userId,
        fields: ['Overview', 'PrimaryImageAspectRatio'] as any,
      });
      return resp.data.Items?.[0] ?? null;
    },

    async fetchPersonFilmography(personId: string) {
      this.initializeApi();
      const resp = await getItemsApi(this.api).getItems({
        userId: this.userId,
        personIds: [personId],
        includeItemTypes: ['Movie', 'Series'] as any,
        sortBy: ['PremiereDate'] as any,
        sortOrder: ['Descending'] as any,
        fields: ['Overview', 'UserData'] as any,
        enableUserData: true,
        recursive: true,
      });
      return resp.data.Items ?? [];
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

    async fetchAudioTracks(albumId: string) {
      this.initializeApi();
      const resp = await getItemsApi(this.api).getItems({
        userId: this.userId,
        parentId: albumId,
        includeItemTypes: ["Audio"] as any,
        sortBy: ["ParentIndexNumber", "IndexNumber", "SortName"],
        sortOrder: ["Ascending"],
      });
      return resp.data.Items ?? [];
    },
    getPlaceholderImage(itemType?: string): string {
      return generatePlaceholderImage(itemType || "default");
    },

    async downloadItem(
      itemId: string,
      onProgress?: (progress: {
        percentage: number;
        loaded: number;
        total: number;
      }) => void
    ) {
      try {
        // Récupérer les infos de l'item
        const item = await this.fetchItemDetails(itemId);

        // Télécharger via le service natif
        await downloadService.downloadForOffline(
          this.serverUrl,
          itemId,
          this.accessToken || "",
          item,
          (progress: { percentage: number; loaded: number; total: number }) => {
            // Mettre à jour le state
            this.downloadProgress[itemId] = progress.percentage;

            // Callback externe
            if (onProgress) {
              onProgress({
                percentage: progress.percentage,
                loaded: progress.loaded,
                total: progress.total,
              });
            }
          }
        );

        // Nettoyer après téléchargement
        delete this.downloadProgress[itemId];
      } catch (error: any) {
        logger.error("Erreur téléchargement:", error);
        delete this.downloadProgress[itemId];
        throw error;
      }
    },

    async downloadItemForOffline(
      itemId: string,
      onProgress?: (progress: {
        percentage: number;
        loaded: number;
        total: number;
      }) => void
    ) {
      try {
        // Récupérer les infos de l'item
        const item = await this.fetchItemDetails(itemId);

        // Télécharger pour usage hors ligne
        await downloadService.downloadForOffline(
          this.serverUrl,
          itemId,
          this.accessToken || "",
          item,
          (progress) => {
            // Mettre à jour le state
            this.downloadProgress[itemId] = progress.percentage;

            // Callback externe
            if (onProgress) {
              onProgress({
                percentage: progress.percentage,
                loaded: progress.loaded,
                total: progress.total,
              });
            }
          }
        );

        // Nettoyer après téléchargement
        delete this.downloadProgress[itemId];

        // Mettre à jour le store offline (il se rafraîchira automatiquement)
        logger.log("✅ Item téléchargé pour usage hors ligne:", itemId);
      } catch (error: any) {
        logger.error("Erreur téléchargement offline:", error);
        delete this.downloadProgress[itemId];
        throw error;
      }
    },

    cancelDownload(itemId: string) {
      downloadService.cancelDownload(itemId);
      delete this.downloadProgress[itemId];
    },

    isDownloading(itemId: string): boolean {
      return downloadService.isDownloading(itemId);
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

    person: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 210'%3E%3Crect fill='%231e1e1e' width='140' height='210'/%3E%3Ccircle cx='70' cy='65' r='28' fill='%239aa0a6'/%3E%3Cellipse cx='70' cy='145' rx='40' ry='35' fill='%239aa0a6'/%3E%3C/svg%3E`,

    default: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 450'%3E%3Crect fill='%231e1e1e' width='300' height='450'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='48' fill='%239aa0a6' font-family='Arial'%3E❓%3C/text%3E%3Ctext x='50%25' y='70%25' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='%239aa0a6' font-family='Arial'%3ENo Image%3C/text%3E%3C/svg%3E`,
  };

  return placeholders[type] || placeholders.default;
}
