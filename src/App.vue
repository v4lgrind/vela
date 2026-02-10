<template>
  <SearchBar v-if="isAuthenticated" />
  <router-view :key="route.fullPath" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SearchBar from './SearchBar.vue';
import { useJellyfinStore } from './store/jellyfin-store';

const route = useRoute();
const router = useRouter();
const store = useJellyfinStore();
const isAuthenticated = computed(() => store.isAuthenticated);

// Android back button handler — called from Kotlin via evaluateJavascript
(window as any).__handleBack = () => {
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
