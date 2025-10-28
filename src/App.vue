<template>
  <SearchBar />
  <router-view :key="route.fullPath" />
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import SearchBar from './SearchBar.vue';
const route = useRoute()
// Pas de logique spécifique dans App.vue
// Tout est géré via Vue Router
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #000000;
}
</style>
