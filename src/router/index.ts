import { createRouter, createWebHashHistory } from "vue-router";
import LoginPage from "../LoginPage.vue";
import MediaList from "../MediaList.vue";
import LibraryItemsPage from "../LibraryItemsPage.vue";
import ItemDetailsPage from "../ItemDetailsPage.vue";
import PlayerPage from "../PlayerPage.vue";
import { useJellyfinStore } from "../store/jellyfin-store";

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
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach(async (to, from, next) => {
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
  // Sinon, laisser passer
  else {
    next();
  }
});
