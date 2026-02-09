<template>
  <div class="media-list">
    <header>
      <h2>Ma Bibliothèque</h2>
    </header>
    <div v-if="loading" class="loading">Chargement...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <ul class="library-list" v-else>
      <li v-for="item in mediaItems" :key="item.Id" class="media-item">
        <router-link class="media-title" :to="{ name: 'libraryItem', params: { id: item.Id, name: item.Name } }">
          <div>
            <LazyImg :src="item.imageUrl" alt="poster" :item-type="item.Type" class="poster" />
            <div class="meta">
              {{ item.Name }}
            </div>
          </div>
        </router-link>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useJellyfinStore } from './store/jellyfin-store';
import LazyImg from './components/LazyImg.vue';
import { useImageError } from './composables/useImageError';

const store = useJellyfinStore();
const { handleImageError } = useImageError();

const mediaItems = ref<Array<{ Id: string; Name: string; imageUrl: string; Type?: string }>>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function loadMedia() {
  loading.value = true;
  error.value = null;
  try {
    const libs = await store.fetchLibraries();
    mediaItems.value = libs.map(lib => ({
      ...lib,
      imageUrl: store.getImageUrl(lib.Id, 'Primary', 300, 150) || ''
    }));
  } catch (e) {
    error.value = 'Erreur lors du chargement des médias';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadMedia();
});
</script>

<style scoped>
.media-list {
  padding: 20px;
  color: #e0e0e0;
  background: #121212;
  min-height: 100vh;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

header h2 {
  font-size: 1.8rem;
  font-weight: 600;
  margin: 0;
}

.btn.logout {
  background: #ff4c4c;
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  color: #fff;
  transition: background 0.2s, transform 0.15s;
}

.btn.logout:hover {
  background: #e03b3b;
  transform: translateY(-1px);
}

.library-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  list-style: none;
  padding: 0;
  margin: 0;
}

@media (min-width: 640px) {
  .library-list {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
  }
}

@media (min-width: 1200px) {
  .library-list {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
  }
}

.media-item {
  background: #1e1e1e;
  border-radius: 12px;
  border: 1px solid #232323;
  transition: transform 0.2s, background 0.2s, border-color 0.2s, box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 10px 12px;
  overflow: hidden;
}

.media-item:hover {
  transform: translateY(-5px);
  background: #242424;
  border-color: #2c2c2c;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.35);
}

.poster-link {
  display: inline-block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 0 8px rgba(100, 100, 150, 0.8);
  transition: transform 0.2s;
}

.poster-link:hover {
  transform: scale(1.02);
}

.poster-link img,
.poster {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
}

.library-list a.media-title {
  margin-top: 8px;
  color: #38f9d7;
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  line-height: 1.3;
  text-shadow: 0 1px 5px #111, 0 0 2px #2f2f2f;
  transition: color 0.2s, text-shadow 0.2s;
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.library-list a.media-title:hover {
  color: #43e97b;
  text-decoration: underline;
  text-shadow: 0 2px 8px #222;
}

.loading,
.error {
  padding: 40px 20px;
  text-align: center;
  font-size: 1.1rem;
}

.error {
  color: #ff6b6b;
}

.loading {
  color: #9aa0a6;
}

</style>