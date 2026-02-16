<template>
  <div
    v-if="
      isAuthenticated && offlineStore.initialized && !offlineStore.isFullyOnline
    "
    class="offline-banner"
  >
    📡 Mode hors ligne - Contenu téléchargé uniquement
    <button v-if="offlineStore.syncInProgress" class="sync-status">
      <span class="spinner-tiny"></span>
      Synchronisation...
    </button>
  </div>
  <SearchBar v-if="isAuthenticated" />
  <router-view :key="route.fullPath" :style="routerViewStyle" />
  <MiniAudioPlayer
    v-if="
      isAuthenticated &&
      audioStore.isMiniPlayerVisible &&
      !audioStore.isExpanded
    "
  />
  <ExpandedAudioPlayer v-if="isAuthenticated && audioStore.isExpanded" />
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import SearchBar from "@/components/SearchBar.vue";
import MiniAudioPlayer from "@/components/MiniAudioPlayer.vue";
import ExpandedAudioPlayer from "@/components/ExpandedAudioPlayer.vue";
import { useJellyfinStore } from "@/store/jellyfin-store";
import { useAudioPlayerStore } from "@/store/audio-player-store";
import { useOfflineStore } from "@/store/offline-store";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

const route = useRoute();
const router = useRouter();
const store = useJellyfinStore();
const audioStore = useAudioPlayerStore();
const offlineStore = useOfflineStore();
const isAuthenticated = computed(() => store.isAuthenticated);

// Initialize offline store on app mount
onMounted(async () => {
  if (Capacitor.isNativePlatform()) {
    await CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      // If we're on the home page, exit the app
      if (route.path === "/" || !canGoBack) {
        CapacitorApp.exitApp();
      } else {
        // If on workout execution page, confirm before going back
        if (route.path.includes("workout/")) {
          if (window.confirm("Are you sure you want to quit this workout?")) {
            router.back();
          }
        } else {
          router.back();
        }
      }
    });
  }

  if (isAuthenticated.value) {
    try {
      await offlineStore.init();
    } catch (error) {
      console.error("[App] Failed to initialize offline store:", error);
      // Continue without offline features if initialization fails
    }
  }
});

const routerViewStyle = computed(() => {
  if (audioStore.isMiniPlayerVisible && !audioStore.isExpanded) {
    return { paddingBottom: "72px" };
  }
  return {};
});
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #e0e0e0;
  background-color: #000000;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.offline-banner {
  background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
  color: #fff;
  padding: 10px 12px;
  text-align: center;
  font-weight: 600;
  font-size: 0.9rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 1000;
}

.sync-status {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border: none;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: default;
}

.spinner-tiny {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin-tiny 0.6s linear infinite;
}

@keyframes spin-tiny {
  to {
    transform: rotate(360deg);
  }
}
</style>
