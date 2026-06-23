<template>
  <SearchBar v-if="isAuthenticated && route.name !== 'search'" />
  <router-view :key="route.path" :style="routerViewStyle" />
  <MiniAudioPlayer
    v-if="isAuthenticated && audioStore.isMiniPlayerVisible && !audioStore.isExpanded"
  />
  <ExpandedAudioPlayer v-if="isAuthenticated && audioStore.isExpanded" />
  <BottomNav v-if="showBottomNav" />
  <AppToast />
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import SearchBar from "@/components/SearchBar.vue";
import MiniAudioPlayer from "@/components/MiniAudioPlayer.vue";
import ExpandedAudioPlayer from "@/components/ExpandedAudioPlayer.vue";
import BottomNav from "@/components/BottomNav.vue";
import AppToast from "@/components/ui/toast/AppToast.vue";
import { useJellyfinStore } from "@/store/jellyfin-store";
import { useAudioPlayerStore } from "@/store/audio-player-store";
import { useOfflineStore } from "@/store/offline-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { useDpadNavigation } from "@/composables/useDpadNavigation";
import { usePlatform } from "@/composables/usePlatform";
import { useBottomNavVisible } from "@/composables/useBottomNav";
import { App as CapacitorApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { NativeVideo } from "@/plugins/NativeVideoPlugin";
import { logger } from "@/utils/logger";


const route = useRoute();
const router = useRouter();
const store = useJellyfinStore();
const audioStore = useAudioPlayerStore();
const offlineStore = useOfflineStore();
const preferencesStore = usePreferencesStore();
useDpadNavigation();
const { isNative } = usePlatform();
const isAuthenticated = computed(() => store.isAuthenticated);

// Bottom nav: visible on the main authenticated screens. Hidden on the
// fullscreen player, the login screen, and while the expanded audio player
// covers the UI. Shared with MiniAudioPlayer so it can stack above the nav.
const showBottomNav = useBottomNavVisible();

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
      logger.error("[App] Failed to initialize offline store:", error);
    }
  }
});

const routerViewStyle = computed(() => {
  const miniVisible = audioStore.isMiniPlayerVisible && !audioStore.isExpanded;
  // Bottom nav floats ~66px tall with a 16px offset + an 8px gap; reserve that
  // (plus the gesture-bar inset) so page content never hides behind it. The
  // mini player stacks above the nav, so add its height on top when both show.
  const navClear = "98px";
  if (showBottomNav.value && miniVisible) {
    return { paddingBottom: `calc(${navClear} + 64px + var(--sab, env(safe-area-inset-bottom, 0px)))` };
  }
  if (showBottomNav.value) {
    return { paddingBottom: `calc(${navClear} + var(--sab, env(safe-area-inset-bottom, 0px)))` };
  }
  if (miniVisible) {
    return { paddingBottom: "72px" };
  }
  return {};
});
</script>
