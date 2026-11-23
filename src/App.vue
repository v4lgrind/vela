<template>
  <div :style="{ marginLeft: shellStyle.marginLeft }">
    <!-- Library lists stay alive while an item opened from them is shown, so
         going back keeps their loaded pages and scroll position. -->
    <router-view v-slot="{ Component }">
      <keep-alive include="LibraryItemsPage" :max="3">
        <component :is="Component" :key="route.path" :style="{ paddingBottom: shellStyle.paddingBottom }" />
      </keep-alive>
    </router-view>
  </div>
  <MiniAudioPlayer
    v-if="isAuthenticated && audioStore.isMiniPlayerVisible && !audioStore.isExpanded"
  />
  <ExpandedAudioPlayer v-if="isAuthenticated && audioStore.isExpanded" />
  <AppNav v-if="showBottomNav" />
  <AppToast />
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import MiniAudioPlayer from "@/components/MiniAudioPlayer.vue";
import ExpandedAudioPlayer from "@/components/ExpandedAudioPlayer.vue";
import AppNav from "@/components/AppNav.vue";
import AppToast from "@/components/ui/toast/AppToast.vue";
import { useSessionStore } from "@/store/session-store";
import { useAudioPlayerStore } from "@/store/audio-player-store";
import { useOfflineStore } from "@/store/offline-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { useDpadNavigation } from "@/composables/useDpadNavigation";
import { usePlatform } from "@/composables/usePlatform";
import { useBottomNavVisible } from "@/composables/useBottomNav";
import { useWideLayout } from "@/composables/useWideLayout";
import { contentStyle } from "@/utils/shellLayout";
import { App as CapacitorApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { NativeVideo } from "@/plugins/NativeVideoPlugin";
import { logger } from "@/utils/logger";


const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const audioStore = useAudioPlayerStore();
const offlineStore = useOfflineStore();
const preferencesStore = usePreferencesStore();
useDpadNavigation();
const { isNative } = usePlatform();
const isAuthenticated = computed(() => session.isAuthenticated);

// Bottom nav: visible on the main authenticated screens. Hidden on the
// fullscreen player, the login screen, and while the expanded audio player
// covers the UI. Shared with MiniAudioPlayer so it can stack above the nav.
const showBottomNav = useBottomNavVisible();
const wide = useWideLayout();

// ── Theme ──────────────────────────────────────────────────────────────────────

async function updateStatusBar(isDark: boolean) {
  if (!isNative) return;
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

// Sync offline watch progress when forceOfflineMode is disabled
watch(
  () => preferencesStore.forceOfflineMode,
  (isForce, wasForce) => {
    if (wasForce && !isForce && offlineStore.isFullyOnline) {
      offlineStore.syncWatchProgress();
    }
  },
);

// Initialize the offline store after a fresh login. onMounted only runs init()
// for users already authenticated at launch; when auth flips true mid-session
// (login flow) it would otherwise never run, leaving offlineStore.initialized
// false all session and hiding the Offline button.
watch(isAuthenticated, async (authed) => {
  if (authed && !offlineStore.initialized) {
    try {
      await offlineStore.init();
    } catch (error) {
      logger.error("[App] Failed to initialize offline store after login:", error);
    }
  }
});


let colorSchemeQuery: MediaQueryList | null = null;
let mediaQueryListener: (() => void) | null = null;
let visibilityListener: (() => void) | null = null;
let resizeListener: (() => void) | null = null;

onBeforeUnmount(() => {
  if (colorSchemeQuery && mediaQueryListener) colorSchemeQuery.removeEventListener('change', mediaQueryListener);
  if (visibilityListener) document.removeEventListener('visibilitychange', visibilityListener);
  if (resizeListener) window.removeEventListener('resize', resizeListener);
});

onMounted(async () => {
  // Apply persisted theme immediately
  applyTheme(preferencesStore.colorScheme);

  // Track system preference changes for 'system' mode
  mediaQueryListener = () => {
    if (preferencesStore.colorScheme === 'system') applyTheme('system');
  };
  colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  colorSchemeQuery.addEventListener('change', mediaQueryListener);

  if (isNative) {
    // Set safe area CSS variables from native insets on initial load
    try {
      const insets = await NativeVideo.getSafeAreaInsets();
      const root = document.documentElement;
      root.style.setProperty('--sat', `${insets.top}px`);
      root.style.setProperty('--sab', `${insets.bottom}px`);
      root.style.setProperty('--sal', `${insets.left}px`);
      root.style.setProperty('--sar', `${insets.right}px`);
    } catch { /* non-native fallback, env() handles it */ }

    // Re-apply status bar icon style when returning from NativePlayerActivity or rotating
    visibilityListener = () => {
      if (document.visibilityState === 'visible') applyTheme(preferencesStore.colorScheme);
    };
    resizeListener = () => applyTheme(preferencesStore.colorScheme);
    document.addEventListener('visibilitychange', visibilityListener);
    window.addEventListener('resize', resizeListener, { passive: true });
  }

  if (isNative) {
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
      logger.error("[App] Failed to initialize offline store:", error);
    }
  }
});

const shellStyle = computed(() => contentStyle({
  navVisible: showBottomNav.value,
  wide: wide.value,
  miniVisible: audioStore.isMiniPlayerVisible && !audioStore.isExpanded,
}));
</script>
