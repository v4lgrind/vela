<template>
  <div class="offline-library">
    <div class="header">
      <router-link to="/libraries" class="btn ghost">← Retour</router-link>
      <h1 class="title">📥 Téléchargements</h1>
      <div class="spacer"></div>
    </div>

    <div class="stats">
      <div class="stat">
        <span class="stat-value">{{ offlineStore.downloadCount }}</span>
        <span class="stat-label">éléments</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ formatSize(offlineStore.totalStorageUsed) }}</span>
        <span class="stat-label">stockage</span>
      </div>
      <div class="stat">
        <span class="stat-label">Dernière sync:</span>
        <span class="stat-value">{{ formatLastSync(offlineStore.lastSyncTime) }}</span>
      </div>
    </div>

    <div v-if="offlineStore.downloadCount === 0" class="empty-state">
      <div class="empty-icon">📭</div>
      <h2>Aucun contenu hors ligne</h2>
      <p>Téléchargez du contenu depuis les pages de détails pour le regarder sans connexion.</p>
      <router-link to="/libraries" class="btn primary">Parcourir la bibliothèque</router-link>
    </div>

    <div v-else class="content">
      <!-- Movies Section -->
      <section v-if="offlineStore.movieDownloads.length > 0" class="section">
        <h2 class="section-title">🎬 Films ({{ offlineStore.movieDownloads.length }})</h2>
        <ul class="items-grid">
          <li v-for="movie in offlineStore.movieDownloads" :key="movie.itemId" class="item-card">
            <router-link :to="{ name: 'ItemDetails', params: { id: movie.itemId } }" class="poster-wrapper">
              <LazyImg :src="getImageUrl(movie.itemId, movie.jellyfinItem.Type)" :alt="movie.name"
                :item-type="movie.jellyfinItem.Type" class="poster" />
              <div class="downloaded-badge">✓</div>
            </router-link>
            <div class="meta">
              <div class="name" :title="movie.name">{{ movie.name }}</div>
              <div class="type">{{ formatSize(movie.fileSize) }}</div>
              <button @click="deleteDownload(movie.itemId, movie.name)" class="btn-delete">🗑️ Supprimer</button>
            </div>
          </li>
        </ul>
      </section>

      <!-- TV Shows Section -->
      <section v-if="offlineStore.tvShowsGrouped.length > 0" class="section">
        <h2 class="section-title">📺 Séries ({{ offlineStore.tvShowsGrouped.length }})</h2>
        <div v-for="series in offlineStore.tvShowsGrouped" :key="series.seriesId" class="series-group">
          <h3 class="series-title">{{ series.seriesName }}</h3>
          <div v-for="season in series.seasons" :key="season.seasonId" class="season-group">
            <h4 class="season-title">Saison {{ season.seasonNumber }} ({{ season.episodes.length }} épisodes)</h4>
            <ul class="items-grid">
              <li v-for="episode in season.episodes" :key="episode.itemId" class="item-card">
                <router-link :to="{ name: 'ItemDetails', params: { id: episode.itemId } }" class="poster-wrapper">
                  <LazyImg :src="getImageUrl(episode.itemId, episode.jellyfinItem.Type)" :alt="episode.name"
                    :item-type="episode.jellyfinItem.Type" class="poster" />
                  <div class="downloaded-badge">✓</div>
                </router-link>
                <div class="meta">
                  <div class="name" :title="episode.name">Ep {{ episode.episodeNumber }}: {{ episode.name }}</div>
                  <div class="type">{{ formatSize(episode.fileSize) }}</div>
                  <button @click="deleteDownload(episode.itemId, episode.name)" class="btn-delete">🗑️</button>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Music Section -->
      <section v-if="offlineStore.musicDownloads.length > 0" class="section">
        <h2 class="section-title">🎵 Musique ({{ offlineStore.musicDownloads.length }})</h2>
        <ul class="items-grid music-grid">
          <li v-for="music in offlineStore.musicDownloads" :key="music.itemId" class="item-card">
            <router-link :to="{ name: 'ItemDetails', params: { id: music.itemId } }" class="poster-wrapper square">
              <LazyImg :src="getImageUrl(music.itemId, music.jellyfinItem.Type)" :alt="music.name"
                :item-type="music.jellyfinItem.Type" class="poster" />
              <div class="downloaded-badge">✓</div>
            </router-link>
            <div class="meta">
              <div class="name" :title="music.name">{{ music.name }}</div>
              <div class="type">{{ formatSize(music.fileSize) }}</div>
              <button @click="deleteDownload(music.itemId, music.name)" class="btn-delete">🗑️</button>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useOfflineStore } from '@/store/offline-store';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { downloadService } from '@/services/downloadService';
import LazyImg from '@/components/LazyImg.vue';
import { isAudioType } from '@/utils/helpers';

const offlineStore = useOfflineStore();
const jellyfinStore = useJellyfinStore();

function getImageUrl(id: string, itemType?: string) {
  const isAudio = itemType && isAudioType(itemType);
  return jellyfinStore.getImageUrl(id, 'Primary', isAudio ? 150 : 130, isAudio ? 150 : 195) || '';
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatLastSync(timestamp: number): string {
  if (!timestamp) return 'Jamais';
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'À l\'instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours} h`;
  return `Il y a ${days} j`;
}

async function deleteDownload(itemId: string, name: string) {
  if (!confirm(`Supprimer "${name}" du stockage hors ligne ?`)) {
    return;
  }

  try {
    await downloadService.deleteOfflineFile(itemId);
    await offlineStore.removeDownload(itemId);
    console.log('✅ Téléchargement supprimé:', name);
  } catch (error) {
    console.error('❌ Erreur lors de la suppression:', error);
    alert('Erreur lors de la suppression du téléchargement');
  }
}

onMounted(async () => {
  await offlineStore.loadDownloads();
});
</script>

<style scoped>
.offline-library {
  min-height: 100vh;
  background: #121212;
  color: #e0e0e0;
  padding: 20px;
}

.header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.title {
  justify-self: center;
  font-size: 1.8rem;
  font-weight: 600;
  margin: 0;
}

.spacer {
  justify-self: end;
}

.btn {
  height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: transform .15s ease, background .2s ease, color .2s ease, border-color .2s ease;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
}

.btn.ghost {
  background: transparent;
  border: 1px solid #2a2a2a;
  color: #e0e0e0;
}

.btn.ghost:hover {
  background: #1f1f1f;
  transform: translateY(-1px);
}

.btn.primary {
  background: #38f9d7;
  color: #121212;
  margin-top: 20px;
}

.btn.primary:hover {
  background: #43e97b;
  transform: translateY(-1px);
}

.stats {
  display: flex;
  gap: 20px;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.stat {
  background: #1e1e1e;
  padding: 12px 20px;
  border-radius: 10px;
  border: 1px solid #2a2a2a;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: #38f9d7;
}

.stat-label {
  font-size: 0.85rem;
  color: #9aa0a6;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 20px;
}

.empty-state h2 {
  font-size: 1.5rem;
  margin-bottom: 10px;
}

.empty-state p {
  color: #9aa0a6;
  margin-bottom: 20px;
}

.section {
  margin-bottom: 40px;
}

.section-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 20px;
  color: #38f9d7;
}

.series-group {
  margin-bottom: 30px;
}

.series-title {
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 15px;
  color: #f0f0f0;
}

.season-group {
  margin-bottom: 20px;
}

.season-title {
  font-size: 1.1rem;
  font-weight: 500;
  margin-bottom: 15px;
  color: #9aa0a6;
}

.items-grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

@media (min-width: 480px) {
  .items-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 16px;
  }
}

.music-grid {
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}

@media (min-width: 480px) {
  .music-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
}

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
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 10px;
  overflow: hidden;
  background: #0f0f0f;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45);
  position: relative;
}

.poster-wrapper.square {
  aspect-ratio: 1 / 1;
}

.poster {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.downloaded-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #38f9d7;
  color: #121212;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

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
  margin-bottom: 4px;
}

.type {
  font-size: 0.8rem;
  color: #9aa0a6;
  margin-bottom: 8px;
}

.btn-delete {
  background: #ff4c4c;
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background .2s ease, transform .15s ease;
  width: 100%;
}

.btn-delete:hover {
  background: #e03b3b;
  transform: translateY(-1px);
}

.btn-delete:active {
  transform: translateY(0);
}
</style>
