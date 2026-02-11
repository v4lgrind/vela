import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

const app = createApp(App);

app.use(router);
app.use(pinia);
app.mount("#app");

import { audioPlayerService } from './services/audioPlayerService';
try {
  audioPlayerService.init();
} catch (error) {
  console.error('[Main] Failed to initialize audio player service:', error);
}
