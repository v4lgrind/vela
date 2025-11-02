<template>
  <div class="items-page">
    <header class="items-header">
      <button class="btn ghost" @click="$router.back()">← Retour</button>
      <h2 class="items-title">{{ libraryName }}</h2>
      <button class="btn logout" @click="onLogout">Déconnexion</button>
    </header>

    <section class="items-content">
      <ul class="items-grid">
        <li v-for="item in items" :key="item.Id" class="item-card">

          <router-link v-if="item.Type === 'BoxSet'"
            :to="{ name: 'libraryItem', params: { id: item.Id, name: item.Name } }" class="poster-wrapper"
            :class="{ 'square': isAudioType(item.Type) }">
            <img @error="(e) => handleImageError(e, item.Type)" :src="getImageUrl(item.Id)" :alt="item.Name"
              class="poster" loading="lazy" @click="loadPage()">
          </router-link>

          <router-link v-else :to="{ name: 'ItemDetails', params: { id: item.Id } }" class="poster-wrapper"
            :class="{ 'square': isAudioType(item.Type) }">
            <img @error="(e) => handleImageError(e, item.Type)" :src="getImageUrl(item.Id)" :alt="item.Name"
              class="poster" loading="lazy" />
          </router-link>

          <div class="meta">
            <div class="name" :title="item.Name">{{ item.Name }}</div>
            <div class="type">{{ item.Type }}</div>
          </div>
        </li>
      </ul>

      <!-- Pagination -->
      <div class="pagination">
        <button class="btn ghost" :disabled="startIndex === 0" @click="prevPage">← Précédent</button>
        <span class="page-indicator">Page {{ currentPage }}</span>
        <button class="btn ghost" :disabled="!hasNextPage" @click="nextPage">Suivant →</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from './store/jellyfin-store';

const store = useJellyfinStore();
const route = useRoute();
const router = useRouter();
const libraryId = route.params.id as string;
const libraryName = route.params.name as string;

const items = ref<any[]>([]);
const limit = ref(50);
const startIndex = ref(0);
const hasNextPage = ref(false);
const loading = ref(true);
const error = ref<string | null>(null);

const currentPage = computed(() => Math.floor(startIndex.value / limit.value) + 1);

// AJOUT: Fonction pour déterminer si c'est un type audio
function isAudioType(type: string): boolean {
  return type === 'Audio' || type === 'MusicAlbum' || type === 'MusicArtist';
}

function handleImageError(e: Event, itemType: string) {
  const img = e.target as HTMLImageElement;
  let fallbackUrl = store.getPlaceholderImage(itemType)
  img.src = fallbackUrl;
}

function getImageUrl(id: string) {
  return store.getImageUrl(id, 'Primary') || '';
}

async function onLogout() {
  await store.logout();
  router.push({ name: 'login' });
}

async function loadPage() {
  loading.value = true;
  error.value = null;
  try {
    const pageItems = await store.fetchItems(libraryId, {
      startIndex: startIndex.value,
      limit: limit.value,
    });
    items.value = pageItems;

    hasNextPage.value = pageItems.length === limit.value;
  } catch (e) {
    error.value = 'Erreur lors du chargement des éléments';
  } finally {
    loading.value = false;
  }
}

async function nextPage() {
  if (hasNextPage.value) {
    startIndex.value += limit.value;
    await loadPage();
    scrollTopSmooth();
  }
}

async function prevPage() {
  if (startIndex.value >= limit.value) {
    startIndex.value -= limit.value;
  } else {
    startIndex.value = 0;
  }
  await loadPage();
  scrollTopSmooth();
}

function scrollTopSmooth() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

onMounted(loadPage);

watch(() => route.params.id, async (newId) => {
  if (!newId) return;
  startIndex.value = 0;
  await loadPage();
});
</script>

<style scoped>
/* Conteneur général */
.items-page {
  min-height: 100vh;
  background: #121212;
  color: #e0e0e0;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

/* En-tête */
.items-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.items-title {
  justify-self: center;
  font-size: 1.8rem;
  font-weight: 600;
  margin: 0;
}

.btn {
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: transform .15s ease, background .2s ease, color .2s ease, border-color .2s ease;
}

.btn.ghost {
  justify-self: start;
  background: transparent;
  border: 1px solid #2a2a2a;
  color: #e0e0e0;
}

.btn.ghost:hover {
  background: #1f1f1f;
  transform: translateY(-1px);
}

.btn.logout {
  justify-self: end;
  background: #ff4c4c;
  color: #fff;
  border: none;
}

.btn.logout:hover {
  background: #e03b3b;
  transform: translateY(-1px);
}

/* Corps */
.items-content {
  flex: 1;
}

/* Grille des items */
.items-grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 18px;
}

/* Carte d'item */
.item-card {
  background: #1e1e1e;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #232323;
  transition: transform .2s ease, box-shadow .2s ease, background .2s ease, border-color .2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 10px 12px;
}

.item-card:hover {
  transform: translateY(-4px);
  background: #242424;
  border-color: #2c2c2c;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.35);
}

.poster-wrapper {
  width: 130px;
  height: 195px;
  border-radius: 10px;
  overflow: hidden;
  background: #0f0f0f;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45);
}

.poster-wrapper.square {
  width: 150px;
  height: 150px;
}

.poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* Métadonnées */
.meta {
  width: 100%;
  text-align: center;
  margin-top: 10px;
}

.name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #f0f0f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.type {
  margin-top: 4px;
  font-size: 0.8rem;
  color: #9aa0a6;
}

.media-title {
  margin-top: 8px;
  color: #38f9d7;
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  line-height: 1.3;
  text-shadow: 0 1px 5px #111, 0 0px 2px #2f2f2f;
  transition: color 0.2s, text-shadow 0.2s;
}

.media-title:hover {
  color: #43e97b;
  text-decoration: underline;
  text-shadow: 0 2px 8px #222;
}

/* Responsive petits écrans */
@media (max-width: 480px) {
  .items-header {
    grid-template-columns: auto 1fr auto;
  }

  .items-title {
    font-size: 1.4rem;
  }

  .poster-wrapper {
    width: 120px;
    height: 180px;
  }

  /* AJOUT: Poster carré responsive */
  .poster-wrapper.square {
    width: 140px;
    height: 140px;
  }
}

.pagination {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.page-indicator {
  color: #dcdcdc;
  font-weight: 600;
}
</style>
