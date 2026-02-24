import { createRouter, createWebHashHistory } from "vue-router";
import LoginPage from "@/pages/LoginPage.vue";
import MediaList from "@/pages/MediaList.vue";
import LibraryItemsPage from "@/pages/LibraryItemsPage.vue";
import ItemDetailsPage from "@/pages/ItemDetailsPage.vue";
import PlayerPage from "@/pages/PlayerPage.vue";
import OfflineLibraryPage from "@/pages/OfflineLibraryPage.vue";
import { useJellyfinStore } from "@/store/jellyfin-store";
import { useAudioPlayerStore } from "@/store/audio-player-store";

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
    path: "/play/:id",
    name: "Player",
    component: PlayerPage,
    meta: { requiresAuth: true },
    props: true,
  },
  {
    path: "/settings",
    name: "settings",
    component: () => import("@/pages/SettingsPage.vue"),
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

  // Si la page nécessite une auth et qu'on n'est pas connecté
  if (requiresAuth && !isAuthenticated) {
    next({ name: "login" });
  }
  // Si on est connecté et qu'on accède à la page login
  else if (to.name === "login" && isAuthenticated) {
    next({ name: "libraries" });
  }
  // Redirect audio items away from the video player route
  else if (to.name === "Player" && to.params.id) {
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
