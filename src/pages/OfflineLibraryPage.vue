<template>
  <div class="min-h-dvh bg-surface text-text-primary p-5">

    <!-- Header -->
    <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-5">
      <Button variant="outline" class="justify-self-start flex items-center gap-1" @click="navigateBack">
        <ArrowLeft class="size-4" />
        {{ backLabel }}
      </Button>
      <h1 class="text-2xl font-semibold m-0 text-center truncate">{{ pageTitle }}</h1>
      <div class="justify-self-end"></div>
    </div>

    <!-- Active Downloads -->
    <section v-if="activeDownloads.length > 0 && view === 'root'" class="mb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold text-accent-purple-light flex items-center gap-2">
          <Loader2 class="size-5 animate-spin" />
          Downloading ({{ activeDownloads.length }})
        </h2>
        <Button variant="ghost" size="sm" class="text-red-400 hover:text-red-300 hover:bg-red-500/10" @click="cancelAll">
          <X class="size-4 mr-1" /> Cancel all
        </Button>
      </div>
      <div class="space-y-3">
        <Card v-for="task in activeDownloads" :key="task.itemId" class="bg-surface-raised border-border-default p-4">
          <div class="flex items-center justify-between gap-4 mb-2">
            <div class="flex-1 min-w-0">
              <div class="font-medium text-text-heading truncate">{{ task.name }}</div>
              <div class="text-xs text-text-muted">
                <template v-if="task.status === 'queued'">Queued…</template>
                <template v-else>{{ formatSize(task.loaded) }} / {{ formatSize(task.total) }}</template>
              </div>
            </div>
            <Button variant="ghost" size="sm" @click="cancelDownload(task.itemId)" class="text-red-400 hover:text-red-300 hover:bg-red-500/10">
              <X class="size-4" />
            </Button>
          </div>
          <div class="h-2 bg-white/10 rounded-full overflow-hidden">
            <div class="h-full transition-all duration-300"
              :class="task.status === 'queued' ? 'bg-white/20' : 'bg-accent-purple'"
              :style="{ width: task.status === 'queued' ? '100%' : `${task.progress}%` }" />
          </div>
          <div class="text-right text-xs mt-1" :class="task.status === 'queued' ? 'text-text-muted' : 'text-accent-purple-light'">
            {{ task.status === 'queued' ? 'Waiting' : `${task.progress}%` }}
          </div>
        </Card>
      </div>
    </section>

    <!-- Empty state -->
    <div v-if="offlineStore.downloadCount === 0 && activeDownloads.length === 0" class="text-center py-15">
      <div class="text-6xl mb-5">📭</div>
      <h2 class="text-xl mb-2.5">No offline content</h2>
      <p class="text-text-muted mb-5">Download content from detail pages to watch without a connection.</p>
      <Button as-child><router-link to="/libraries">Browse library</router-link></Button>
    </div>

    <template v-else>

      <!-- ── ROOT VIEW ── -->
      <template v-if="view === 'root'">

        <!-- Stats -->
        <div class="flex gap-4 mb-8 flex-wrap">
          <Card class="bg-surface-raised border-border-input px-5 py-3 flex flex-col items-center gap-1">
            <span class="text-2xl font-bold text-accent-purple-light">{{ offlineStore.downloadCount }}</span>
            <span class="text-sm text-text-muted">items</span>
          </Card>
          <Card class="bg-surface-raised border-border-input px-5 py-3 flex flex-col items-center gap-1">
            <span class="text-2xl font-bold text-accent-purple-light">{{ formatSize(offlineStore.totalStorageUsed) }}</span>
            <span class="text-sm text-text-muted">storage</span>
          </Card>
        </div>

        <!-- Movies -->
        <section v-if="offlineStore.movieDownloads.length > 0" class="mb-10">
          <h2 class="text-lg font-semibold mb-4 text-accent-purple-light">Movies ({{ offlineStore.movieDownloads.length }})</h2>
          <ul class="list-none p-0 m-0 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-4">
            <li v-for="movie in offlineStore.movieDownloads" :key="movie.itemId">
              <MediaCard :item="movie" @delete="deleteDownload(movie.itemId, movie.name)">
                <router-link :to="{ name: 'ItemDetails', params: { id: movie.itemId } }" class="block w-full aspect-[2/3] rounded-[10px] overflow-hidden bg-black/60 shadow-lg relative">
                  <LazyImg :src="getImageUrl(movie.itemId, 'Movie')" :alt="movie.name" item-type="Movie" class="w-full h-full object-cover block" />
                  <Badge class="absolute top-2 right-2 bg-accent-purple text-white size-6 rounded-full flex items-center justify-center p-0 text-xs font-bold shadow-lg">✓</Badge>
                </router-link>
                <template #title>{{ movie.name }}</template>
                <template #meta>{{ formatSize(movie.fileSize) }}</template>
              </MediaCard>
            </li>
          </ul>
        </section>

        <!-- TV Shows — series grid -->
        <section v-if="offlineStore.tvShowsGrouped.length > 0" class="mb-10">
          <h2 class="text-lg font-semibold mb-4 text-accent-purple-light">TV Shows ({{ offlineStore.tvShowsGrouped.length }})</h2>
          <ul class="list-none p-0 m-0 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-4">
            <li v-for="series in offlineStore.tvShowsGrouped" :key="series.seriesId">
              <div class="cursor-pointer group" @click="openSeries(series)">
                <div class="w-full aspect-[2/3] rounded-[10px] overflow-hidden bg-black/60 shadow-lg relative
                            group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200">
                  <LazyImg :src="getImageUrl(series.seriesId, 'Series')" :alt="series.seriesName"
                    item-type="Series" class="w-full h-full object-cover block" />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div class="absolute bottom-0 left-0 right-0 px-2 pb-2">
                    <span class="text-[0.65rem] text-white/70">
                      {{ series.seasons.length }} season{{ series.seasons.length !== 1 ? 's' : '' }}
                    </span>
                  </div>
                </div>
                <div class="mt-2 text-center">
                  <div class="text-[0.9rem] font-semibold text-text-heading truncate leading-tight" :title="series.seriesName">
                    {{ series.seriesName }}
                  </div>
                  <div class="text-xs text-text-muted">
                    {{ totalEpisodes(series) }} ep{{ totalEpisodes(series) !== 1 ? 's' : '' }}
                  </div>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <!-- Music -->
        <section v-if="offlineStore.musicDownloads.length > 0" class="mb-10">
          <h2 class="text-lg font-semibold mb-4 text-accent-purple-light">Music ({{ offlineStore.musicDownloads.length }})</h2>
          <ul class="list-none p-0 m-0 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:gap-4">
            <li v-for="music in offlineStore.musicDownloads" :key="music.itemId">
              <MediaCard :item="music" @delete="deleteDownload(music.itemId, music.name)">
                <router-link :to="{ name: 'ItemDetails', params: { id: music.itemId } }" class="block w-full aspect-square rounded-[10px] overflow-hidden bg-black/60 shadow-lg relative">
                  <LazyImg :src="getImageUrl(music.itemId, 'Audio')" :alt="music.name" item-type="Audio" class="w-full h-full object-cover block" />
                  <Badge class="absolute top-2 right-2 bg-accent-purple text-white size-6 rounded-full flex items-center justify-center p-0 text-xs font-bold shadow-lg">✓</Badge>
                </router-link>
                <template #title>{{ music.name }}</template>
                <template #meta>{{ formatSize(music.fileSize) }}</template>
              </MediaCard>
            </li>
          </ul>
        </section>
      </template>

      <!-- ── SEASONS VIEW ── -->
      <template v-else-if="view === 'seasons' && selectedSeries">
        <ul class="list-none p-0 m-0 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-4">
          <li v-for="season in selectedSeries.seasons" :key="season.seasonId">
            <div class="cursor-pointer group" @click="openSeason(season)">
              <div class="w-full aspect-[2/3] rounded-[10px] overflow-hidden bg-black/60 shadow-lg relative
                          group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200">
                <LazyImg :src="getImageUrl(season.seasonId, 'Season')" :alt="`Season ${season.seasonNumber}`"
                  item-type="Season" class="w-full h-full object-cover block" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div class="absolute bottom-0 left-0 right-0 px-2 pb-2">
                  <span class="text-[0.65rem] text-white/70">{{ season.episodes.length }} ep{{ season.episodes.length !== 1 ? 's' : '' }}</span>
                </div>
              </div>
              <div class="mt-2 text-center">
                <div class="text-[0.9rem] font-semibold text-text-heading">Season {{ season.seasonNumber }}</div>
                <div class="text-xs text-text-muted">{{ season.episodes.length }} downloaded</div>
              </div>
            </div>
          </li>
        </ul>
      </template>

      <!-- ── EPISODES VIEW ── -->
      <template v-else-if="view === 'episodes' && selectedSeason">
        <div class="flex flex-col gap-2">
          <div v-for="ep in selectedSeason.episodes" :key="ep.itemId"
            class="flex gap-3 p-3 rounded-xl border border-border-default bg-surface-raised hover:border-border-hover hover:bg-surface-hover transition-all duration-200">
            <!-- Thumbnail -->
            <router-link :to="{ name: 'ItemDetails', params: { id: ep.itemId } }"
              class="relative w-[120px] h-[68px] sm:w-[160px] sm:h-[90px] rounded-lg overflow-hidden bg-black/40 shrink-0">
              <LazyImg :src="getImageUrl(ep.itemId, 'Episode')" :alt="ep.name"
                item-type="Episode" class="w-full h-full object-cover block" />
              <div class="absolute bottom-1 left-1.5">
                <span class="text-[0.6rem] text-white/80 font-semibold bg-black/60 rounded px-1">E{{ ep.episodeNumber }}</span>
              </div>
            </router-link>
            <!-- Info -->
            <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div>
                <router-link :to="{ name: 'ItemDetails', params: { id: ep.itemId } }"
                  class="font-semibold text-sm text-text-heading line-clamp-2 hover:text-accent-purple-light transition-colors">
                  {{ ep.name }}
                </router-link>
                <div class="text-xs text-text-muted mt-0.5">{{ formatSize(ep.fileSize) }}</div>
              </div>
              <Button variant="destructive" size="sm" class="self-start mt-2" @click="deleteDownload(ep.itemId, ep.name)">
                <Trash2 class="size-3.5 mr-1" /> Delete
              </Button>
            </div>
          </div>
        </div>
      </template>

    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useOfflineStore } from '@/store/offline-store';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useDownloadStore } from '@/store/download-store';
import { downloadService } from '@/services/downloadService';
import LazyImg from '@/components/LazyImg.vue';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Trash2, X, Loader2 } from 'lucide-vue-next';
import { defineComponent, h } from 'vue';

// Inline media card helper component
const MediaCard = defineComponent({
  props: { item: Object },
  emits: ['delete'],
  setup(_, { slots, emit }) {
    return () => h('div', { class: 'flex flex-col' }, [
      slots.default?.(),
      h('div', { class: 'mt-2 text-center' }, [
        h('div', { class: 'text-[0.9rem] font-semibold text-text-heading truncate leading-tight' }, slots.title?.()),
        h('div', { class: 'text-xs text-text-muted mb-2' }, slots.meta?.()),
        h(Button, { variant: 'destructive', size: 'sm', class: 'w-full', onClick: () => emit('delete') }, () => [
          h(Trash2, { class: 'size-3.5 mr-1' }), 'Delete',
        ]),
      ]),
    ]);
  },
});

const offlineStore = useOfflineStore();
const jellyfinStore = useJellyfinStore();
const downloadStore = useDownloadStore();

type View = 'root' | 'seasons' | 'episodes';
const view = ref<View>('root');
const selectedSeries = ref<any>(null);
const selectedSeason = ref<any>(null);

const activeDownloads = computed(() => downloadStore.activeDownloads);

const pageTitle = computed(() => {
  if (view.value === 'seasons' && selectedSeries.value) return selectedSeries.value.seriesName;
  if (view.value === 'episodes' && selectedSeason.value) return `Season ${selectedSeason.value.seasonNumber}`;
  return 'Downloads';
});

const backLabel = computed(() => {
  if (view.value === 'seasons') return 'Downloads';
  if (view.value === 'episodes') return selectedSeries.value?.seriesName ?? 'Back';
  return 'Back';
});

function navigateBack() {
  if (view.value === 'episodes') { view.value = 'seasons'; selectedSeason.value = null; return; }
  if (view.value === 'seasons') { view.value = 'root'; selectedSeries.value = null; return; }
  history.back();
}

function openSeries(series: any) {
  selectedSeries.value = series;
  view.value = 'seasons';
}

function openSeason(season: any) {
  selectedSeason.value = season;
  view.value = 'episodes';
}

function totalEpisodes(series: any): number {
  return series.seasons.reduce((n: number, s: any) => n + s.episodes.length, 0);
}

function cancelDownload(itemId: string) {
  downloadStore.cancelDownload(itemId);
}

function cancelAll() {
  if (!confirm('Cancel all downloads?')) return;
  downloadStore.cancelAll();
}

function getImageUrl(id: string, itemType?: string) {
  const isAudio = itemType === 'Audio' || itemType === 'MusicAlbum';
  return jellyfinStore.getImageUrl(id, 'Primary', isAudio ? 150 : 130, isAudio ? 150 : 195) || '';
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

async function deleteDownload(itemId: string, name: string) {
  if (!confirm(`Delete "${name}" from offline storage?`)) return;
  try {
    await downloadService.deleteOfflineFile(itemId);
    await offlineStore.removeDownload(itemId);
    // If now empty, pop back a level
    if (view.value === 'episodes' && selectedSeason.value) {
      const updated = offlineStore.tvShowsGrouped
        .find(s => s.seriesId === selectedSeries.value?.seriesId)
        ?.seasons.find((s: any) => s.seasonId === selectedSeason.value.seasonId);
      if (!updated || updated.episodes.length === 0) navigateBack();
      else selectedSeason.value = updated;
    }
  } catch {
    alert('Failed to delete download');
  }
}

onMounted(async () => {
  await offlineStore.loadDownloads();
});
</script>
