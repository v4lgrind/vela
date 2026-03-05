<template>
  <div
    v-if="isAuthenticated && offlineStore.initialized && !offlineStore.isFullyOnline"
    class="bg-gradient-to-br from-accent-orange to-[#f7931e] text-white px-3 py-2.5 text-center font-semibold text-sm shadow-md flex items-center justify-center gap-3 sticky top-0 z-[1000]"
  >
    Offline mode - Downloaded content only
    <span v-if="offlineStore.syncInProgress" class="bg-white/20 text-white border-none px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-default">
      <Loader2 class="size-3 animate-spin" />
      Syncing...
    </span>
  </div>
  <SearchBar v-if="isAuthenticated" />
  <router-view :key="route.fullPath" :style="routerViewStyle" />
  <MiniAudioPlayer
    v-if="isAuthenticated && audioStore.isMiniPlayerVisible && !audioStore.isExpanded"
  />
  <ExpandedAudioPlayer v-if="isAuthenticated && audioStore.isExpanded" />
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import SearchBar from "@/components/SearchBar.vue";
import MiniAudioPlayer from "@/components/MiniAudioPlayer.vue";
import ExpandedAudioPlayer from "@/components/ExpandedAudioPlayer.vue";
import { useJellyfinStore } from "@/store/jellyfin-store";
import { useAudioPlayerStore } from "@/store/audio-player-store";
import { useOfflineStore } from "@/store/offline-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Loader2 } from "lucide-vue-next";

const route = useRoute();
const router = useRouter();
const store = useJellyfinStore();
const audioStore = useAudioPlayerStore();
const offlineStore = useOfflineStore();
const preferencesStore = usePreferencesStore();
const isAuthenticated = computed(() => store.isAuthenticated);

// ── Theme ──────────────────────────────────────────────────────────────────────

async function updateStatusBar(isDark: boolean) {
  if (!Capacitor.isNativePlatform()) return;
  await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
}

function applyTheme(scheme: 'dark' | 'light' | 'system') {
  const html = document.documentElement;
  if (scheme === 'light') {
    html.classList.add('light');
    updateStatusBar(false);
  } else if (scheme === 'dark') {
    html.classList.remove('light');
    updateStatusBar(true);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.classList.toggle('light', !prefersDark);
    updateStatusBar(prefersDark);
  }
}

watch(() => preferencesStore.colorScheme, (scheme) => applyTheme(scheme));

// Redirect to offline library when going offline while on a server-browsing page
watch(() => offlineStore.isFullyOnline, (online) => {
  if (!online && (route.name === 'libraries' || route.name === 'libraryItem')) {
    router.replace({ name: 'offline' });
  }
});

// Initialize offline store on app mount
onMounted(async () => {
  // Apply persisted theme immediately
  applyTheme(preferencesStore.colorScheme);

  // Track system preference changes for 'system' mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (preferencesStore.colorScheme === 'system') applyTheme('system');
  });

  if (Capacitor.isNativePlatform()) {
    await CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      if (route.path === "/" || !canGoBack) {
        CapacitorApp.exitApp();
      } else {
        router.back();
      }
    });
  }

  if (isAuthenticated.value) {
    try {
      await offlineStore.init();
    } catch (error) {
      console.error("[App] Failed to initialize offline store:", error);
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
