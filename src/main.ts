import "@fontsource-variable/outfit";
import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { i18n } from "./i18n";
import { router } from "./router";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { Capacitor } from "@capacitor/core";
import { StatusBar } from "@capacitor/status-bar";
import { useSessionStore } from "./store/session-store";

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

const app = createApp(App);

app.use(pinia);
app.use(i18n);

// The session (and the one-time import of pre-session Jellyfin accounts, which
// shares the old store's localStorage key) must be ready before any page runs.
useSessionStore(pinia)
  .restore()
  .catch((error) => console.error("[Main] Failed to restore the session:", error))
  .finally(() => {
    app.use(router);
    app.mount("#app");
  });

if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  StatusBar.setBackgroundColor({ color: '#00000000' }); // Transparent for edge-to-edge
  // StatusBar icon style is set by App.vue based on the persisted colorScheme preference
}

import { audioPlayerService } from './services/audioPlayerService';
try {
  audioPlayerService.init();
} catch (error) {
  console.error('[Main] Failed to initialize audio player service:', error);
}
