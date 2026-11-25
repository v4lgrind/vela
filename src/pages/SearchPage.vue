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
        <li v-for="item in filteredResults" :key="item.id" class="cursor-pointer" @click="goToItem(item)">
          <!-- Poster -->
          <div class="relative w-full overflow-hidden bg-surface shadow-lg active:opacity-80 transition-opacity"
            :class="posterShape(item)">
            <LazyImg
              :src="itemImageUrl(item)"
              :alt="item.title"
              :kind="item.kind"
              class="w-full h-full object-cover block"
            />
            <!-- Download badge -->
            <div v-if="offlineStore.isItemDownloaded(item.id)"
              class="absolute top-1.5 left-1.5 size-5 rounded-full bg-accent-purple/85 flex items-center justify-center shadow pointer-events-none">
              <DownloadIcon class="size-[11px] text-accent-ink" />
            </div>
            <div v-else-if="downloadStore.isDownloading(item.id)"
              class="absolute top-1.5 left-1.5 size-5 rounded-full bg-accent-purple/85 flex items-center justify-center shadow pointer-events-none animate-pulse">
              <Loader2 class="size-[11px] text-accent-ink animate-spin" />
            </div>
            <!-- Watched toggle -->
            <button
              v-if="!isMusic(item)"
              @click.stop="toggleWatched(item)"
              :disabled="watchingId === item.id"
              :aria-label="item.user.played ? t('common.markUnwatched') : t('common.markWatched')"
              class="absolute top-1 right-1 size-9 rounded-full flex items-center justify-center shadow transition-all active:scale-95 disabled:opacity-60"
              :class="item.user.played ? 'bg-accent-purple text-accent-ink' : 'bg-black/50 text-white/60 hover:bg-black/75 hover:text-white'">
              <Loader2 v-if="watchingId === item.id" class="size-3.5 animate-spin" />
              <Check v-else class="size-3.5" :stroke-width="3" />
            </button>
            <!-- Song: tap plays -->
            <div v-if="item.kind === 'track'"
              class="absolute bottom-1.5 right-1.5 size-7 rounded-full bg-black/60 flex items-center justify-center pointer-events-none">
              <Play class="size-3.5 text-white fill-current" />
            </div>
            <!-- Episode label -->
            <div v-if="item.kind === 'episode' && (item.seasonNumber || item.episodeNumber)"
              class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
              <p class="text-white text-xs font-semibold">
                S{{ item.seasonNumber }}E{{ item.episodeNumber }}
              </p>
            </div>
          </div>
          <!-- Info -->
          <div class="mt-1.5 px-0.5">
            <p class="text-xs font-medium text-text-heading line-clamp-2 leading-tight" :title="item.title">{{ item.title }}</p>
            <p v-if="item.kind === 'episode' && item.seriesTitle"
              class="text-[10.5px] text-text-muted mt-0.5 truncate">{{ item.seriesTitle }}</p>
            <p v-else-if="artistOf(item)"
              class="text-[10.5px] text-text-muted mt-0.5 truncate">{{ artistOf(item) }}</p>
            <p v-else-if="item.year"
              class="text-[10.5px] text-text-muted mt-0.5">{{ item.year }}</p>
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
import type { ItemKind, MediaItem, Track } from '@/domain';
import { useBackend, useImageUrl } from '@/composables/useBackend';
import LazyImg from '@/components/LazyImg.vue';
import { Download as DownloadIcon, Loader2, Play, Search, Check } from 'lucide-vue-next';
import { useOfflineStore } from '@/store/offline-store';
import { useDownloadStore } from '@/store/download-store';
import { useToast } from '@/composables/useToast';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { trackToAudioTrack } from '@/utils/audioTrack';

const route = useRoute();
const offlineStore = useOfflineStore();
const downloadStore = useDownloadStore();
const { t } = useI18n();
const router = useRouter();
const backend = useBackend();
const imageUrl = useImageUrl();
const { showError } = useToast();
const audioStore = useAudioPlayerStore();

const inputEl = ref<HTMLInputElement | null>(null);
const searchQuery = ref((route.query.q as string) || '');
const results = ref<MediaItem[]>([]);
const isSearching = ref(false);
const watchingId = ref<string | null>(null);

async function toggleWatched(item: MediaItem) {
  if (watchingId.value) return;
  watchingId.value = item.id;
  try {
    const played = !item.user.played;
    await backend.value.userData.setPlayed(item.id, played);
    item.user.played = played;
  } finally {
    watchingId.value = null;
  }
}

type SearchKind = Extract<ItemKind, 'movie' | 'series' | 'episode' | 'artist' | 'album' | 'track'>;
const SEARCH_KINDS: SearchKind[] = ['movie', 'series', 'episode', 'artist', 'album', 'track'];
const MUSIC_KINDS = new Set<ItemKind>(['artist', 'album', 'track']);
const SEARCH_LIMIT = 200;

const activeTab = ref<'all' | SearchKind>('all');
let debounceId: number | undefined;

const tabs = [
  { value: 'all' as const,     label: 'search.tabs.all' },
  { value: 'movie' as const,   label: 'search.tabs.movies' },
  { value: 'series' as const,  label: 'search.tabs.shows' },
  { value: 'episode' as const, label: 'search.tabs.episodes' },
  { value: 'artist' as const,  label: 'search.tabs.artists' },
  { value: 'album' as const,   label: 'search.tabs.albums' },
  { value: 'track' as const,   label: 'search.tabs.songs' },
];

function isMusic(item: MediaItem) {
  return MUSIC_KINDS.has(item.kind);
}

function posterShape(item: MediaItem) {
  if (item.kind === 'episode') return 'aspect-video rounded-xl';
  if (item.kind === 'artist') return 'aspect-square rounded-full';
  if (isMusic(item)) return 'aspect-square rounded-xl';
  return 'aspect-[2/3] rounded-xl';
}

function artistOf(item: MediaItem): string {
  if (item.kind === 'track') return item.albumArtist || item.artists.map((a) => a.name).join(', ');
  if (item.kind === 'album') return item.artists.map((a) => a.name).join(', ');
  return '';
}

const filteredResults = computed(() => {
  if (activeTab.value === 'all') return results.value;
  return results.value.filter(r => r.kind === activeTab.value);
});

function tabCount(kind: string) {
  return results.value.filter(r => r.kind === kind).length;
}

/** Episodes show their still (series poster as fallback); songs use the album cover. */
function itemImageUrl(item: MediaItem): string {
  // Grid cells: 3 columns on phones, auto-fill 140px+ wider; ~200 CSS px at most.
  if (item.kind === 'episode') return imageUrl(item.images.thumb ?? item.images.poster, { width: 200, height: 113 });
  if (isMusic(item)) return imageUrl(item.images.poster, { width: 200, height: 200 });
  return imageUrl(item.images.poster, { width: 200, height: 300 });
}

function goToItem(item: MediaItem) {
  if (item.kind === 'track') {
    // Same as the library's Songs list: the matching songs become the queue.
    const songs = results.value.filter((r): r is Track => r.kind === 'track');
    audioStore.playAlbum(songs.map((song) => trackToAudioTrack(song)), songs.indexOf(item));
  } else if (item.kind === 'episode') {
    router.push({ name: 'Player', params: { id: item.id } });
  } else {
    router.push({ name: 'ItemDetails', params: { id: item.id } });
  }
}

async function doSearch(term: string) {
  if (!term.trim()) { results.value = []; return; }
  isSearching.value = true;
  try {
    results.value = await backend.value.catalog.search({ term, limit: SEARCH_LIMIT, kinds: SEARCH_KINDS });
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
