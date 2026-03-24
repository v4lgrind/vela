<template>
  <SearchBar v-if="isAuthenticated && route.name !== 'search'" />
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
import { useDpadNavigation } from "@/composables/useDpadNavigation";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";


const route = useRoute();
const router = useRouter();
const store = useJellyfinStore();
const audioStore = useAudioPlayerStore();
const offlineStore = useOfflineStore();
const preferencesStore = usePreferencesStore();
useDpadNavigation();
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
watch(
  () => [offlineStore.isFullyOnline, preferencesStore.forceOfflineMode] as const,
  ([online, forceOffline]) => {
    if ((!online || forceOffline) && (route.name === 'libraries' || route.name === 'libraryItem')) {
      router.replace({ name: 'offline' });
    }
  },
);

// Sync offline watch progress when forceOfflineMode is disabled
watch(
  () => preferencesStore.forceOfflineMode,
  (isForce, wasForce) => {
    if (wasForce && !isForce && offlineStore.isFullyOnline) {
      offlineStore.syncWatchProgress();
    }
  },
);


onMounted(async () => {
  // Apply persisted theme immediately
  applyTheme(preferencesStore.colorScheme);

  // Track system preference changes for 'system' mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (preferencesStore.colorScheme === 'system') applyTheme('system');
  });

  if (Capacitor.isNativePlatform()) {
    // Re-apply status bar icon style when returning from NativePlayerActivity or rotating
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') applyTheme(preferencesStore.colorScheme);
    });
    window.addEventListener('resize', () => applyTheme(preferencesStore.colorScheme), { passive: true });
  }

  if (Capacitor.isNativePlatform()) {
    await CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      // On the offline library page in offline mode, back should exit the app
      // (sub-view navigation is handled inside the component)
      const isOffline = !offlineStore.isFullyOnline || preferencesStore.forceOfflineMode;
      if (isOffline && route.name === 'offline') {
        CapacitorApp.exitApp();
        return;
      }
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
