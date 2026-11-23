import { createRouter, createWebHashHistory } from "vue-router";
import { useSessionStore } from "@/store/session-store";
import { trackToAudioTrack } from "@/utils/audioTrack";
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
    component: () => import("@/pages/LoginPage.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/libraries",
    name: "libraries",
    meta: { requiresAuth: true },
    component: () => import("@/pages/MediaList.vue"),
  },
  {
    path: "/library",
    name: "libraryList",
    meta: { requiresAuth: true },
    component: () => import("@/pages/LibrariesPage.vue"),
  },
  {
    path: "/offline",
    name: "offline",
    meta: { requiresAuth: true },
    component: () => import("@/pages/OfflineLibraryPage.vue"),
  },
  {
    path: "/libraryItem/:name/:id",
    name: "libraryItem",
    meta: { requiresAuth: true },
    component: () => import("@/pages/LibraryItemsPage.vue"),
  },
  {
    path: "/item/:id",
    name: "ItemDetails",
    component: () => import("@/pages/ItemDetailsPage.vue"),
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
    component: () => import("@/pages/PlayerPage.vue"),
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
  // New destinations start at the top; browser history still restores the
  // previous position when returning to a list or detail page.
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 };
  },
});

router.beforeEach(async (to, _from, next) => {
  const session = useSessionStore();
  await session.restore();

  const isAuthenticated = session.isAuthenticated;
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
  // Redirect audio items away from the video player route (skip when offline to avoid server calls)
  else if (!isOffline && to.name === "Player" && to.params.id && session.backend) {
    try {
      const item = await session.backend.catalog.item(to.params.id as string);
      if (item.kind === "track") {
        useAudioPlayerStore().playTrack(trackToAudioTrack(item));
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
