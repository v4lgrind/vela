import { createRouter, createWebHashHistory } from "vue-router";
import LoginPage from "@/pages/LoginPage.vue";
import MediaList from "@/pages/MediaList.vue";
import LibraryItemsPage from "@/pages/LibraryItemsPage.vue";
import ItemDetailsPage from "@/pages/ItemDetailsPage.vue";
import PlayerPage from "@/pages/PlayerPage.vue";
import OfflineLibraryPage from "@/pages/OfflineLibraryPage.vue";
import { useJellyfinStore } from "@/store/jellyfin-store";
import { useAudioPlayerStore } from "@/store/audio-player-store";
import { useOfflineStore } from "@/store/offline-store";
import { usePreferencesStore } from "@/store/preferences-store";

const routes = [
  {
    path: "/",
    redirect: "/login",
  },
  {
    path: "/login",
    name: "login",
    component: LoginPage,
    meta: { requiresAuth: false },
  },
  {
    path: "/libraries",
    name: "libraries",
    meta: { requiresAuth: true },
    component: MediaList,
  },
  {
    path: "/offline",
    name: "offline",
    meta: { requiresAuth: true },
    component: OfflineLibraryPage,
  },
  {
    path: "/libraryItem/:name/:id",
    name: "libraryItem",
    meta: { requiresAuth: true },
    component: LibraryItemsPage,
  },
  {
    path: "/item/:id",
    name: "ItemDetails",
    component: ItemDetailsPage,
    meta: { requiresAuth: true },
    props: true,
  },
  {
    path: "/person/:id",
    name: "PersonDetail",
    component: () => import("@/pages/PersonDetailPage.vue"),
    meta: { requiresAuth: true },
    props: true,
  },
  {
    path: "/play/:id",
    name: "Player",
    component: PlayerPage,
    meta: { requiresAuth: true },
    props: true,
  },
  {
    path: "/search",
    name: "search",
    component: () => import("@/pages/SearchPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/pages/SettingsPage.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/logs",
    name: "logs",
    component: () => import("@/pages/LogViewerPage.vue"),
    meta: { requiresAuth: true },
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to, _from, next) => {
  const store = useJellyfinStore();

  // Initialiser l'API si on a un token persisté
  if (store.accessToken && !store.api) {
    store.initializeApi();
  }

  const isAuthenticated = store.isAuthenticated;
  const requiresAuth = to.meta.requiresAuth ?? true;
  const offlineStore = useOfflineStore();
  const preferencesStore = usePreferencesStore();
  const isOffline = !offlineStore.isFullyOnline || preferencesStore.forceOfflineMode;

  // Si la page nécessite une auth et qu'on n'est pas connecté
  if (requiresAuth && !isAuthenticated) {
    next({ name: "login" });
  }
  // Si on est connecté et qu'on accède à la page login
  else if (to.name === "login" && isAuthenticated) {
    next({ name: "libraries" });
  }
  // Block server-browsing routes when offline — only downloaded content is accessible.
  // Do a fresh server check first to avoid stale state from the 30 s ping interval.
  // Skip when the offline store hasn't initialized yet — it defaults to online, so
  // the watcher in App.vue will redirect later if actually offline.
  else if (offlineStore.initialized && isOffline && (to.name === "libraries" || to.name === "libraryItem")) {
    const stillOffline = !(await offlineStore.recheckOnline());
    if (stillOffline) {
      next({ name: "offline" });
    } else {
      next();
    }
  }
  // Redirect audio items away from the video player route (skip when offline to avoid server calls)
  else if (!isOffline && to.name === "Player" && to.params.id) {
    try {
      const item = store.currentItem?.Id === to.params.id
        ? store.currentItem
        : await store.fetchItemDetails(to.params.id as string);
      if (item && (item.Type === "Audio" || item.MediaType === "Audio")) {
        const audioStore = useAudioPlayerStore();
        audioStore.playTrack({
          id: item.Id,
          name: item.Name || "",
          artist: item.AlbumArtist || item.Artists?.join(", ") || "",
          albumId: item.AlbumId || item.ParentId || item.Id,
          albumName: item.Album || "",
          duration: item.RunTimeTicks ? item.RunTimeTicks / 10_000_000 : 0,
          indexNumber: item.IndexNumber || 0,
        });
        // Stay on current page or go back
        next(false);
        return;
      }
    } catch {
      // If fetch fails, let the player page handle it
    }
    next();
  }
  // Sinon, laisser passer
  else {
    next();
  }
});
