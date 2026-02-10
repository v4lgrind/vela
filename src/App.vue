<template>
  <SearchBar v-if="isAuthenticated" />
  <router-view :key="route.fullPath" :style="routerViewStyle" />
  <MiniAudioPlayer v-if="isAuthenticated && audioStore.isMiniPlayerVisible && !audioStore.isExpanded" />
  <ExpandedAudioPlayer v-if="isAuthenticated && audioStore.isExpanded" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SearchBar from './SearchBar.vue';
import MiniAudioPlayer from './components/MiniAudioPlayer.vue';
import ExpandedAudioPlayer from './components/ExpandedAudioPlayer.vue';
import { useJellyfinStore } from './store/jellyfin-store';
import { useAudioPlayerStore } from './store/audio-player-store';

const route = useRoute();
const router = useRouter();
const store = useJellyfinStore();
const audioStore = useAudioPlayerStore();
const isAuthenticated = computed(() => store.isAuthenticated);

const routerViewStyle = computed(() => {
  if (audioStore.isMiniPlayerVisible && !audioStore.isExpanded) {
    return { paddingBottom: '72px' };
  }
  return {};
});

// Android back button handler — called from Kotlin via evaluateJavascript
(window as any).__handleBack = () => {
  // If expanded audio player is open, collapse it
  if (audioStore.isExpanded) {
    audioStore.isExpanded = false;
    return 'back';
  }
  const name = router.currentRoute.value.name;
  if (name === 'login' || name === 'libraries') {
    return 'exit';
  }
  router.back();
  return 'back';
};
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #e0e0e0;
  background-color: #000000;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>
