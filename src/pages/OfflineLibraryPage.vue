<template>
  <div class="min-h-dvh bg-surface text-text-primary p-5">
    <!-- Header -->
    <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-5">
      <Button variant="outline" as-child class="justify-self-start">
        <router-link to="/libraries"><ArrowLeft class="size-4 mr-1" /> Back</router-link>
      </Button>
      <h1 class="text-2xl font-semibold m-0">Downloads</h1>
      <div class="justify-self-end"></div>
    </div>

    <!-- Stats -->
    <div class="flex gap-5 mb-8 flex-wrap">
      <Card class="bg-surface-raised border-border-input px-5 py-3 flex flex-col items-center gap-1">
        <span class="text-2xl font-bold text-accent-purple-light">{{ offlineStore.downloadCount }}</span>
        <span class="text-sm text-text-muted">items</span>
      </Card>
      <Card class="bg-surface-raised border-border-input px-5 py-3 flex flex-col items-center gap-1">
        <span class="text-2xl font-bold text-accent-purple-light">{{ formatSize(offlineStore.totalStorageUsed) }}</span>
        <span class="text-sm text-text-muted">storage</span>
      </Card>
      <Card class="bg-surface-raised border-border-input px-5 py-3 flex flex-col items-center gap-1">
        <span class="text-sm text-text-muted">Last sync:</span>
        <span class="text-2xl font-bold text-accent-purple-light">{{ formatLastSync(offlineStore.lastSyncTime) }}</span>
      </Card>
    </div>

    <!-- Empty state -->
    <div v-if="offlineStore.downloadCount === 0" class="text-center py-15">
      <div class="text-6xl mb-5">📭</div>
      <h2 class="text-xl mb-2.5">No offline content</h2>
      <p class="text-text-muted mb-5">Download content from detail pages to watch without a connection.</p>
      <Button as-child>
        <router-link to="/libraries">Browse library</router-link>
      </Button>
    </div>

    <!-- Content -->
    <div v-else>
      <!-- Movies Section -->
      <section v-if="offlineStore.movieDownloads.length > 0" class="mb-10">
        <h2 class="text-xl font-semibold mb-5 text-accent-purple-light">Movies ({{ offlineStore.movieDownloads.length }})</h2>
        <ul class="list-none p-0 m-0 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-4">
          <li v-for="movie in offlineStore.movieDownloads" :key="movie.itemId">
            <Card class="bg-surface-raised border-border-default hover:-translate-y-1 hover:bg-surface-hover hover:border-border-hover hover:shadow-xl transition-all duration-200 flex flex-col items-center p-2.5 pb-3 overflow-hidden">
              <router-link :to="{ name: 'ItemDetails', params: { id: movie.itemId } }" class="w-full aspect-[2/3] rounded-[10px] overflow-hidden bg-black/60 shadow-lg relative">
                <LazyImg :src="getImageUrl(movie.itemId, movie.jellyfinItem.Type)" :alt="movie.name"
                  :item-type="movie.jellyfinItem.Type" class="w-full h-full object-cover block" />
                <Badge class="absolute top-2 right-2 bg-accent-purple text-white size-6 rounded-full flex items-center justify-center p-0 text-xs font-bold shadow-lg">✓</Badge>
              </router-link>
              <div class="w-full text-center mt-2.5">
                <div class="text-[0.95rem] font-semibold text-text-heading truncate" :title="movie.name">{{ movie.name }}</div>
                <div class="text-xs text-text-muted mb-2">{{ formatSize(movie.fileSize) }}</div>
                <Button variant="destructive" size="sm" class="w-full" @click="deleteDownload(movie.itemId, movie.name)">
                  <Trash2 class="size-3.5 mr-1" /> Delete
                </Button>
              </div>
            </Card>
          </li>
        </ul>
      </section>

      <!-- TV Shows Section -->
      <section v-if="offlineStore.tvShowsGrouped.length > 0" class="mb-10">
        <h2 class="text-xl font-semibold mb-5 text-accent-purple-light">TV Shows ({{ offlineStore.tvShowsGrouped.length }})</h2>
        <div v-for="series in offlineStore.tvShowsGrouped" :key="series.seriesId" class="mb-8">
          <h3 class="text-lg font-semibold mb-4 text-text-heading">{{ series.seriesName }}</h3>
          <div v-for="season in series.seasons" :key="season.seasonId" class="mb-5">
            <h4 class="text-base font-medium mb-4 text-text-muted">Season {{ season.seasonNumber }} ({{ season.episodes.length }} episodes)</h4>
            <ul class="list-none p-0 m-0 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-4">
              <li v-for="episode in season.episodes" :key="episode.itemId">
                <Card class="bg-surface-raised border-border-default hover:-translate-y-1 hover:bg-surface-hover hover:border-border-hover hover:shadow-xl transition-all duration-200 flex flex-col items-center p-2.5 pb-3 overflow-hidden">
                  <router-link :to="{ name: 'ItemDetails', params: { id: episode.itemId } }" class="w-full aspect-[2/3] rounded-[10px] overflow-hidden bg-black/60 shadow-lg relative">
                    <LazyImg :src="getImageUrl(episode.itemId, episode.jellyfinItem.Type)" :alt="episode.name"
                      :item-type="episode.jellyfinItem.Type" class="w-full h-full object-cover block" />
                    <Badge class="absolute top-2 right-2 bg-accent-purple text-white size-6 rounded-full flex items-center justify-center p-0 text-xs font-bold shadow-lg">✓</Badge>
                  </router-link>
                  <div class="w-full text-center mt-2.5">
                    <div class="text-[0.95rem] font-semibold text-text-heading truncate" :title="episode.name">Ep {{ episode.episodeNumber }}: {{ episode.name }}</div>
                    <div class="text-xs text-text-muted mb-2">{{ formatSize(episode.fileSize) }}</div>
                    <Button variant="destructive" size="sm" class="w-full" @click="deleteDownload(episode.itemId, episode.name)">
                      <Trash2 class="size-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </Card>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Music Section -->
      <section v-if="offlineStore.musicDownloads.length > 0" class="mb-10">
        <h2 class="text-xl font-semibold mb-5 text-accent-purple-light">Music ({{ offlineStore.musicDownloads.length }})</h2>
        <ul class="list-none p-0 m-0 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:gap-4">
          <li v-for="music in offlineStore.musicDownloads" :key="music.itemId">
            <Card class="bg-surface-raised border-border-default hover:-translate-y-1 hover:bg-surface-hover hover:border-border-hover hover:shadow-xl transition-all duration-200 flex flex-col items-center p-2.5 pb-3 overflow-hidden">
              <router-link :to="{ name: 'ItemDetails', params: { id: music.itemId } }" class="w-full aspect-square rounded-[10px] overflow-hidden bg-black/60 shadow-lg relative">
                <LazyImg :src="getImageUrl(music.itemId, music.jellyfinItem.Type)" :alt="music.name"
                  :item-type="music.jellyfinItem.Type" class="w-full h-full object-cover block" />
                <Badge class="absolute top-2 right-2 bg-accent-purple text-white size-6 rounded-full flex items-center justify-center p-0 text-xs font-bold shadow-lg">✓</Badge>
              </router-link>
              <div class="w-full text-center mt-2.5">
                <div class="text-[0.95rem] font-semibold text-text-heading truncate" :title="music.name">{{ music.name }}</div>
                <div class="text-xs text-text-muted mb-2">{{ formatSize(music.fileSize) }}</div>
                <Button variant="destructive" size="sm" class="w-full" @click="deleteDownload(music.itemId, music.name)">
                  <Trash2 class="size-3.5 mr-1" /> Delete
                </Button>
              </div>
            </Card>
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
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Trash2 } from 'lucide-vue-next';

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
  if (!timestamp) return 'Never';
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

async function deleteDownload(itemId: string, name: string) {
  if (!confirm(`Delete "${name}" from offline storage?`)) {
    return;
  }

  try {
    await downloadService.deleteOfflineFile(itemId);
    await offlineStore.removeDownload(itemId);
  } catch (error) {
    console.error('Failed to delete download:', error);
    alert('Failed to delete download');
  }
}

onMounted(async () => {
  await offlineStore.loadDownloads();
});
</script>
