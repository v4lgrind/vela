<template>
  <div class="flex flex-col h-dvh bg-background">
    <!-- Header: pill search field + cancel -->
    <div class="flex items-center gap-2.5 px-gutter pb-3 md:px-gutter-wide"
      style="padding-top: calc(12px + var(--sat, env(safe-area-inset-top, 0px)))">
      <div class="flex-1 flex items-center gap-2.5 bg-surface border border-border-default rounded-2xl px-4 py-3 focus-within:border-accent-purple transition-colors">
        <Search class="size-[19px] text-text-muted shrink-0" :stroke-width="1.9" />
        <input
          ref="inputEl"
          v-model="searchQuery"
          type="search"
          :placeholder="t('search.placeholder')"
          class="flex-1 min-w-0 bg-transparent text-body text-text-heading placeholder:text-text-muted outline-none"
          @input="onInput"
          @keydown.esc="router.back()"
        />
      </div>
      <Button variant="link" class="shrink-0 px-1 font-semibold text-accent-purple" @click="router.back()">
        {{ t('common.cancel') }}
      </Button>
    </div>

    <!-- Filter tabs -->
    <ToggleGroup type="single" variant="outline" size="sm" :model-value="activeTab"
      class="flex shrink-0 justify-start gap-2 overflow-x-auto px-gutter pb-3 scrollbar-hide md:px-gutter-wide"
      @update:model-value="(v) => v && (activeTab = v as typeof activeTab)">
      <ToggleGroupItem v-for="tab in tabs" :key="tab.value" :value="tab.value" class="shrink-0">
        {{ t(tab.label) }}
        <span v-if="tab.value !== 'all' && tabCount(tab.value) > 0" class="ml-1 opacity-70">
          {{ tabCount(tab.value) }}
        </span>
      </ToggleGroupItem>
    </ToggleGroup>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto">
      <!-- No query yet -->
      <EmptyState v-if="!searchQuery.trim()" :icon="Search" :title="t('search.hint')" />

      <!-- Searching -->
      <div v-else-if="isSearching" class="flex items-center justify-center gap-2.5 py-16 text-text-muted">
        <Loader2 class="size-5 animate-spin" />
        <span class="text-body">{{ t('search.searching') }}</span>
      </div>

      <!-- No results -->
      <EmptyState v-else-if="filteredResults.length === 0" :icon="Search" :title="t('search.noResults', { query: searchQuery })" />

      <!-- Grid -->
      <ul v-else class="list-none px-gutter py-4 md:px-gutter-wide m-0 grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:gap-4"
        style="padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px))">
        <li v-for="item in filteredResults" :key="item.Id" class="cursor-pointer" @click="goToItem(item)">
          <!-- Poster -->
          <div class="relative w-full overflow-hidden bg-surface shadow-lg active:opacity-80 transition-opacity"
            :class="posterShape(item)">
            <LazyImg
              :src="itemImageUrl(item)"
              :alt="item.Name"
              :item-type="item.Type"
              class="w-full h-full object-cover block"
            />
            <!-- Download badge -->
            <div v-if="offlineStore.isItemDownloaded(item.Id)"
              class="absolute top-1.5 left-1.5 size-5 rounded-full bg-accent-purple/85 flex items-center justify-center shadow pointer-events-none">
              <DownloadIcon class="size-[11px] text-accent-ink" />
            </div>
            <div v-else-if="downloadStore.isDownloading(item.Id)"
              class="absolute top-1.5 left-1.5 size-5 rounded-full bg-accent-purple/85 flex items-center justify-center shadow pointer-events-none animate-pulse">
              <Loader2 class="size-[11px] text-accent-ink animate-spin" />
            </div>
            <!-- Watched toggle -->
            <button
              v-if="!isMusic(item)"
              @click.stop="toggleWatched(item)"
              :disabled="watchingId === item.Id"
              :aria-label="item.UserData?.Played ? t('common.markUnwatched') : t('common.markWatched')"
              class="absolute top-1 right-1 size-9 rounded-full flex items-center justify-center shadow transition-all active:scale-95 disabled:opacity-60"
              :class="item.UserData?.Played ? 'bg-accent-purple text-accent-ink' : 'bg-black/50 text-white/60 hover:bg-black/75 hover:text-white'">
              <Loader2 v-if="watchingId === item.Id" class="size-3.5 animate-spin" />
              <Check v-else class="size-3.5" :stroke-width="3" />
            </button>
            <!-- Song: tap plays -->
            <div v-if="item.Type === 'Audio'"
              class="absolute bottom-1.5 right-1.5 size-7 rounded-full bg-black/60 flex items-center justify-center pointer-events-none">
              <Play class="size-3.5 text-white fill-current" />
            </div>
            <!-- Episode label -->
            <div v-if="item.Type === 'Episode' && (item.ParentIndexNumber || item.IndexNumber)"
              class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
              <p class="text-white text-xs font-semibold">
                S{{ item.ParentIndexNumber }}E{{ item.IndexNumber }}
              </p>
            </div>
          </div>
          <!-- Info -->
          <div class="mt-1.5 px-0.5">
            <p class="text-xs font-medium text-text-heading line-clamp-2 leading-tight" :title="item.Name">{{ item.Name }}</p>
            <p v-if="item.Type === 'Episode' && item.SeriesName"
              class="text-[10.5px] text-text-muted mt-0.5 truncate">{{ item.SeriesName }}</p>
            <p v-else-if="(item.Type === 'Audio' || item.Type === 'MusicAlbum') && artistOf(item)"
              class="text-[10.5px] text-text-muted mt-0.5 truncate">{{ artistOf(item) }}</p>
            <p v-else-if="item.ProductionYear"
              class="text-[10.5px] text-text-muted mt-0.5">{{ item.ProductionYear }}</p>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { EmptyState } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useJellyfinStore } from '@/store/jellyfin-store';
import LazyImg from '@/components/LazyImg.vue';
import { Download as DownloadIcon, Loader2, Play, Search, Check } from 'lucide-vue-next';
import { useOfflineStore } from '@/store/offline-store';
import { useDownloadStore } from '@/store/download-store';
import { useToast } from '@/composables/useToast';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { toAudioTrack } from '@/utils/audioTrack';

const route = useRoute();
const offlineStore = useOfflineStore();
const downloadStore = useDownloadStore();
const { t } = useI18n();
const router = useRouter();
const store = useJellyfinStore();
const { showError } = useToast();
const audioStore = useAudioPlayerStore();

const inputEl = ref<HTMLInputElement | null>(null);
const searchQuery = ref((route.query.q as string) || '');
const results = ref<any[]>([]);
const isSearching = ref(false);
const watchingId = ref<string | null>(null);

async function toggleWatched(item: any) {
  if (watchingId.value) return;
  watchingId.value = item.Id;
  try {
    if (item.UserData?.Played) {
      await store.markUnplayed(item.Id);
      if (item.UserData) item.UserData.Played = false;
    } else {
      await store.markPlayed(item.Id);
      if (!item.UserData) item.UserData = {};
      item.UserData.Played = true;
    }
  } finally {
    watchingId.value = null;
  }
}
type SearchType = 'Movie' | 'Series' | 'Episode' | 'MusicArtist' | 'MusicAlbum' | 'Audio';
const SEARCH_TYPES: SearchType[] = ['Movie', 'Series', 'Episode', 'MusicArtist', 'MusicAlbum', 'Audio'];
const MUSIC_TYPES = new Set(['MusicArtist', 'MusicAlbum', 'Audio']);
const activeTab = ref<'all' | SearchType>('all');
let debounceId: number | undefined;

const tabs = [
  { value: 'all' as const,     label: 'search.tabs.all' },
  { value: 'Movie' as const,   label: 'search.tabs.movies' },
  { value: 'Series' as const,  label: 'search.tabs.shows' },
  { value: 'Episode' as const, label: 'search.tabs.episodes' },
  { value: 'MusicArtist' as const, label: 'search.tabs.artists' },
  { value: 'MusicAlbum' as const, label: 'search.tabs.albums' },
  { value: 'Audio' as const, label: 'search.tabs.songs' },
];

function isMusic(item: any) {
  return MUSIC_TYPES.has(item.Type);
}

function posterShape(item: any) {
  if (item.Type === 'Episode') return 'aspect-video rounded-xl';
  if (item.Type === 'MusicArtist') return 'aspect-square rounded-full';
  if (isMusic(item)) return 'aspect-square rounded-xl';
  return 'aspect-[2/3] rounded-xl';
}

function artistOf(item: any): string {
  return item.AlbumArtist || item.Artists?.join(', ') || '';
}

const filteredResults = computed(() => {
  if (activeTab.value === 'all') return results.value;
  return results.value.filter(r => r.Type === activeTab.value);
});

function tabCount(type: string) {
  return results.value.filter(r => r.Type === type).length;
}

function itemImageUrl(item: any): string {
  if (item.Type === 'Episode') {
    return store.getImageUrl(item.Id, 'Primary', 400, 225) ||
      store.getImageUrl(item.SeriesId, 'Primary', 130, 195) || '';
  }
  if (isMusic(item)) {
    // Songs rarely have their own image: fall back to the album cover.
    const id = item.Type === 'Audio' && !item.ImageTags?.Primary ? item.AlbumId : item.Id;
    return id ? store.getImageUrl(id, 'Primary', 200, 200) : '';
  }
  return store.getImageUrl(item.Id, 'Primary', 130, 195) || '';
}

function goToItem(item: any) {
  if (item.Type === 'Audio') {
    // Same as the library's Songs list: the matching songs become the queue.
    const songs = results.value.filter((r) => r.Type === 'Audio');
    audioStore.playAlbum(songs.map((song) => toAudioTrack(song)), songs.indexOf(item));
  } else if (item.Type === 'Episode') {
    router.push({ name: 'Player', params: { id: item.Id } });
  } else {
    router.push({ name: 'ItemDetails', params: { id: item.Id } });
  }
}

async function doSearch(term: string) {
  if (!term.trim()) { results.value = []; return; }
  isSearching.value = true;
  try {
    results.value = await store.searchItems({
      searchTerm: term,
      limit: 200,
      includeItemTypes: SEARCH_TYPES,
    });
  } catch {
    results.value = [];
    showError(t('search.failed'));
  } finally {
    isSearching.value = false;
  }
}

function onInput() {
  window.clearTimeout(debounceId);
  debounceId = window.setTimeout(() => doSearch(searchQuery.value), 300);
  router.replace({ name: 'search', query: searchQuery.value.trim() ? { q: searchQuery.value.trim() } : {} });
}

watch(() => route.query.q, (q) => {
  const val = (q as string) || '';
  if (val !== searchQuery.value) {
    searchQuery.value = val;
    doSearch(val);
  }
});

onMounted(() => {
  if (searchQuery.value) doSearch(searchQuery.value);
  else inputEl.value?.focus();
});
</script>
