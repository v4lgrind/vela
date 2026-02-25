import "./assets/main.css";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

const app = createApp(App);

app.use(router);
app.use(pinia);
app.mount("#app");

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark }); // Dark = light/white icons for dark backgrounds
  if (Capacitor.getPlatform() === 'android') {
    StatusBar.setBackgroundColor({ color: '#00000000' }); // Transparent for edge-to-edge
  }
}

import { audioPlayerService } from './services/audioPlayerService';
try {
  audioPlayerService.init();
} catch (error) {
  console.error('[Main] Failed to initialize audio player service:', error);
}
