<template>
  <div class="min-h-dvh bg-background text-text-primary p-5 flex flex-col"
    style="padding-top: calc(20px + var(--sat, env(safe-area-inset-top, 0px)))">
    <!-- Header -->
    <header class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2.5 min-w-0">
        <button @click="router.back()" title="Back"
          class="size-9 shrink-0 rounded-[10px] border border-border-default bg-surface flex items-center justify-center text-text-heading active:opacity-70">
          <ChevronLeft class="size-[18px]" :stroke-width="2" />
        </button>
        <h1 class="text-[22px] font-bold text-text-heading tracking-tight truncate">{{ libraryName }}</h1>
      </div>
      <span class="text-xs text-text-muted shrink-0 ml-2">{{ items.length }} shown</span>
    </header>

    <!-- Music library sections -->
    <nav v-if="isMusicLibrary" class="flex gap-2 mb-3 overflow-x-auto scrollbar-hide">
      <button v-for="tab in MUSIC_TABS" :key="tab.value" @click="selectMusicTab(tab.value)"
        class="shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors"
        :class="musicTab === tab.value ? 'bg-accent-purple text-accent-ink' : 'bg-surface-hover text-text-primary'">
        {{ tab.label }}
      </button>
    </nav>

    <!-- Filters and Sorting -->
    <section class="mb-4">
      <!-- Quick filter pills -->
      <div class="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        <button
          @click="showFilters = !showFilters"
          class="flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-full text-[12.5px] font-semibold transition-colors"
          :class="hasActiveFilters ? 'bg-accent-purple text-accent-ink' : 'bg-surface-hover text-text-primary'">
          <SlidersHorizontal class="size-3.5" />
          Filters
          <ChevronDown class="size-3 transition-transform duration-200" :class="showFilters ? 'rotate-180' : ''" />
        </button>
        <button v-if="!isMusicLibrary"
          @click="quickFilter('IsUnplayed')"
          class="shrink-0 px-3.5 py-2 rounded-full text-[12.5px] font-medium transition-colors"
          :class="filter === 'IsUnplayed' ? 'bg-accent-purple text-accent-ink' : 'bg-surface-hover text-text-primary'">
          Unwatched
        </button>
        <button
          @click="quickFilter('IsFavorite')"
          class="shrink-0 px-3.5 py-2 rounded-full text-[12.5px] font-medium transition-colors"
          :class="filter === 'IsFavorite' ? 'bg-accent-purple text-accent-ink' : 'bg-surface-hover text-text-primary'">
          Favorites
        </button>
        <Button v-if="hasActiveFilters" variant="ghost" size="sm" @click="resetFilters" class="text-xs px-2 text-text-muted shrink-0">Reset</Button>

        <div class="flex-1" />

        <!-- View mode toggle -->
        <button v-if="!showSongList" @click="toggleViewMode" class="shrink-0 size-9 rounded-full bg-surface-hover text-text-primary flex items-center justify-center transition-colors" title="Toggle view">
          <List v-if="viewMode === 'grid'" class="size-4" />
          <LayoutGrid v-else class="size-4" />
        </button>
      </div>

      <!-- Collapsible filter panel -->
      <div v-show="showFilters" class="flex flex-wrap gap-2 items-center mt-3">
        <select v-model="sortBy" @change="onFilterChange" class="bg-surface border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary cursor-pointer focus:border-accent-purple transition-colors">
          <option value="SortName">Name</option>
          <option value="PremiereDate">Release Date</option>
          <option value="DateCreated">Date Added</option>
          <option value="CommunityRating">Rating</option>
          <option value="PlayCount">Play Count</option>
          <option value="Random">Random</option>
        </select>

        <select v-model="sortOrder" @change="onFilterChange" class="bg-surface border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary cursor-pointer focus:border-accent-purple transition-colors">
          <option value="Ascending">↑ Asc</option>
          <option value="Descending">↓ Desc</option>
        </select>

        <select v-model="filter" @change="onFilterChange" class="bg-surface border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary cursor-pointer focus:border-accent-purple transition-colors">
          <option value="">All Items</option>
          <option value="IsUnplayed">Unwatched</option>
          <option value="IsPlayed">Watched</option>
          <option value="IsFavorite">Favorites</option>
        </select>

        <select v-model="selectedGenre" @change="onFilterChange" class="bg-surface border border-border-default rounded-xl px-3 py-2 text-sm text-text-primary cursor-pointer focus:border-accent-purple transition-colors">
          <option value="">All Genres</option>
          <option v-for="genre in availableGenres" :key="genre" :value="genre">{{ genre }}</option>
        </select>
      </div>
    </section>

    <section class="flex-1 relative">
      <!-- Songs: tap plays this page from that song -->
      <ul v-if="showSongList" class="list-none p-0 m-0 flex flex-col pr-5">
        <li v-for="(song, i) in items" :key="song.Id"
          class="flex items-center gap-3 py-2 px-1 border-b border-border-default cursor-pointer active:opacity-80"
          :class="audioStore.currentTrack?.id === song.Id && 'bg-accent-purple/10'"
          @click="playSongs(i)">
          <div class="size-12 shrink-0 rounded-md overflow-hidden bg-black/60">
            <LazyImg :src="getImageUrl(song.AlbumId || song.Id, 'MusicAlbum')" :alt="song.Album" item-type="MusicAlbum"
              class="w-full h-full object-cover block" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-text-heading truncate"
              :class="audioStore.currentTrack?.id === song.Id && 'text-accent-purple-light'">{{ song.Name }}</div>
            <div class="text-xs text-text-muted truncate">{{ [song.AlbumArtist || song.Artists?.[0], song.Album].filter(Boolean).join(' · ') }}</div>
          </div>
          <span v-if="song.RunTimeTicks" class="text-xs text-text-subtle tabular-nums shrink-0">{{ formatTicksDuration(song.RunTimeTicks) }}</span>
          <TrackActionsMenu @play-next="enqueueSong(song, 'next')" @add-to-queue="enqueueSong(song, 'end')" />
        </li>
      </ul>

      <!-- Grid view -->
      <ul v-else-if="viewMode === 'grid'" class="list-none p-0 m-0 grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-4">
        <li v-for="item in items" :key="item.Id" class="group">
          <!-- Poster with overlay -->
          <div class="relative w-full rounded-xl overflow-hidden bg-surface shadow-lg"
            :class="isSquare(item) ? 'aspect-square' : 'aspect-[2/3]'">
            <router-link
              :to="item.Type === 'BoxSet'
                ? { name: 'libraryItem', params: { id: item.Id, name: item.Name } }
                : { name: 'ItemDetails', params: { id: item.Id } }"
              class="block w-full h-full">
              <LazyImg :src="getImageUrl(item.Id, item.Type)" :alt="item.Name" :item-type="item.Type"
                class="w-full h-full object-cover block" />
            </router-link>

            <!-- Watched badge -->
            <div v-if="item.UserData?.Played"
              class="absolute top-1.5 right-1.5 size-[18px] rounded-full bg-accent-purple flex items-center justify-center shadow pointer-events-none">
              <Check class="size-[11px] text-accent-ink" :stroke-width="3" />
            </div>
            <!-- Download badge -->
            <div v-if="offlineStore.isItemDownloaded(item.Id)"
              class="absolute top-1.5 left-1.5 size-5 rounded-full bg-accent-purple/85 flex items-center justify-center shadow pointer-events-none">
              <DownloadIcon class="size-[11px] text-accent-ink" />
            </div>
            <div v-else-if="downloadStore.isDownloading(item.Id)"
              class="absolute top-1.5 left-1.5 size-5 rounded-full bg-accent-purple/85 flex items-center justify-center shadow pointer-events-none animate-pulse">
              <Loader2 class="size-[11px] text-accent-ink animate-spin" />
            </div>

            <!-- Action overlay: always visible on mobile, hover-only on desktop -->
            <div v-if="!isSquare(item) && item.Type !== 'BoxSet'"
              class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent flex items-end justify-center gap-2 pb-2 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 pointer-events-none">
              <button
                @click.prevent.stop="playItem(item)"
                :disabled="playingId === item.Id"
                class="bg-white/90 hover:bg-white text-black rounded-full p-1.5 shadow-lg transition-all active:scale-95 disabled:opacity-60 pointer-events-auto"
                title="Play">
                <Loader2 v-if="playingId === item.Id" class="size-3 animate-spin" />
                <Play v-else class="size-3 fill-black stroke-none" />
              </button>
              <button
                @click.prevent.stop="toggleWatched(item)"
                :disabled="watchingId === item.Id"
                class="rounded-full p-1.5 shadow-lg transition-all active:scale-95 disabled:opacity-60 pointer-events-auto"
                :class="item.UserData?.Played ? 'bg-accent-purple text-accent-ink' : 'bg-white/90 hover:bg-white text-black'"
                :title="item.UserData?.Played ? 'Mark as unwatched' : 'Mark as watched'">
                <Check class="size-3" />
              </button>
            </div>
          </div>

          <div class="mt-1.5 px-0.5">
            <div class="text-xs font-medium text-text-heading truncate leading-tight" :title="item.Name">{{ item.Name }}</div>
            <div v-if="item.ProductionYear" class="text-[10.5px] text-text-muted mt-0.5">{{ item.ProductionYear }}</div>
          </div>
        </li>
      </ul>

      <!-- List view -->
      <ul v-else class="list-none p-0 m-0 flex flex-col">
        <li v-for="item in items" :key="item.Id">
          <router-link
            :to="item.Type === 'BoxSet'
              ? { name: 'libraryItem', params: { id: item.Id, name: item.Name } }
              : { name: 'ItemDetails', params: { id: item.Id } }"
            class="flex items-center gap-3 py-2.5 px-1 border-b border-border-default hover:bg-surface-hover transition-colors active:opacity-80">
            <!-- Thumbnail -->
            <div class="w-[60px] shrink-0 rounded-md overflow-hidden bg-black/60"
              :class="isSquare(item) ? 'aspect-square' : 'aspect-[2/3]'">
              <LazyImg :src="getImageUrl(item.Id, item.Type)" :alt="item.Name" :item-type="item.Type"
                class="w-full h-full object-cover block" />
            </div>
            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-text-heading truncate">{{ item.Name }}</div>
              <div class="text-xs text-text-muted mt-0.5 flex items-center gap-2">
                <span v-if="item.ProductionYear">{{ item.ProductionYear }}</span>
                <span v-if="item.RunTimeTicks">{{ formatRuntime(item.RunTimeTicks) }}</span>
                <span v-if="item.CommunityRating" class="text-yellow-400">★ {{ item.CommunityRating.toFixed(1) }}</span>
              </div>
              <!-- Progress bar for partially watched -->
              <div v-if="item.UserData?.PlayedPercentage && !item.UserData?.Played" class="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
                <div class="h-full bg-accent-purple rounded-full" :style="{ width: item.UserData.PlayedPercentage + '%' }" />
              </div>
            </div>
            <!-- Right side: download + watched + actions -->
            <div class="flex items-center gap-2 shrink-0">
              <div v-if="offlineStore.isItemDownloaded(item.Id)"
                class="rounded-full p-1 bg-accent-purple/20 text-accent-purple" title="Downloaded">
                <DownloadIcon class="size-3" />
              </div>
              <div v-else-if="downloadStore.isDownloading(item.Id)"
                class="rounded-full p-1 bg-accent-purple/20 text-accent-purple animate-pulse">
                <Loader2 class="size-3 animate-spin" />
              </div>
              <div v-if="item.UserData?.Played" class="bg-accent-purple rounded-full p-0.5">
                <Check class="size-3 text-white" />
              </div>
              <button v-if="!isSquare(item) && item.Type !== 'BoxSet'"
                @click.prevent.stop="playItem(item)"
                :disabled="playingId === item.Id"
                class="bg-surface-raised border border-border-default rounded-full p-2 hover:border-accent-purple transition-colors"
                title="Play">
                <Loader2 v-if="playingId === item.Id" class="size-4 animate-spin" />
                <Play v-else class="size-4 fill-text-primary stroke-none" />
              </button>
            </div>
          </router-link>
        </li>
      </ul>

      <p v-if="!loading && !error && !items.length" class="text-center text-sm text-text-muted py-12">Nothing here yet</p>

      <!-- A-Z Quick Jump Sidebar -->
      <div v-if="sortBy === 'SortName'" class="fixed right-0.5 top-1/2 -translate-y-1/2 flex flex-col items-center z-10 py-1">
        <button
          v-for="letter in alphabet" :key="letter"
          @click="jumpToLetter(letter)"
          class="px-1.5 py-[1px] text-[10px] font-bold leading-tight transition-colors"
          :class="nameStartsWith === letter ? 'text-accent-purple' : 'text-text-muted hover:text-text-primary'">
          {{ letter }}
        </button>
      </div>

      <!-- Pagination -->
      <div class="flex items-center justify-center gap-3 mt-6">
        <Button variant="outline" :disabled="startIndex === 0" @click="prevPage" class="min-h-[44px] px-4">
          <ArrowLeft class="size-4 mr-1" /> Previous
        </Button>
        <span class="text-text-primary font-semibold">
          Page {{ currentPage }}
          <span v-if="nameStartsWith" class="text-accent-purple ml-1">({{ nameStartsWith }})</span>
        </span>
        <Button variant="outline" :disabled="!hasNextPage" @click="nextPage" class="min-h-[44px] px-4">
          Next <ArrowRight class="size-4 ml-1" />
        </Button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { logger } from '@/utils/logger';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { usePreferencesStore } from '@/store/preferences-store';
import LazyImg from '@/components/LazyImg.vue';
import { formatTicksDuration, isAudioType } from '@/utils/helpers';
import { toAudioTrack } from '@/utils/audioTrack';
import TrackActionsMenu from '@/components/TrackActionsMenu.vue';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { useToast } from '@/composables/useToast';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Play, Check, Download as DownloadIcon, Loader2, SlidersHorizontal, ChevronDown, ChevronLeft, LayoutGrid, List } from 'lucide-vue-next';
import { useOfflineStore } from '@/store/offline-store';
import { useDownloadStore } from '@/store/download-store';

const store = useJellyfinStore();
const offlineStore = useOfflineStore();
const downloadStore = useDownloadStore();
const audioStore = useAudioPlayerStore();
const toast = useToast();
const prefs = usePreferencesStore();
const route = useRoute();
const router = useRouter();
const libraryId = computed(() => route.params.id as string);
const libraryName = computed(() => (route.params.name as string) || 'Library');

const playingId = ref<string | null>(null);
const watchingId = ref<string | null>(null);

const items = ref<any[]>([]);
const limit = ref(50);
const startIndex = ref(0);
const hasNextPage = ref(false);
const loading = ref(true);
const error = ref<string | null>(null);

let pageRequest = 0;
// Filtering and sorting
const showFilters = ref(false);
const sortBy = ref('SortName');
const sortOrder = ref('Ascending');
const filter = ref('');
const selectedGenre = ref('');

type MusicTab = 'albums' | 'artists' | 'songs' | 'playlists';
const MUSIC_TABS: { value: MusicTab; label: string }[] = [
  { value: 'albums', label: 'Albums' },
  { value: 'artists', label: 'Artists' },
  { value: 'songs', label: 'Songs' },
  { value: 'playlists', label: 'Playlists' },
];
const musicTab = ref<MusicTab>('albums');
const isMusicLibrary = computed(() =>
  store.libraries.find((l) => l.Id === libraryId.value)?.CollectionType === 'music');
const showSongList = computed(() => isMusicLibrary.value && musicTab.value === 'songs');

function selectMusicTab(tab: MusicTab) {
  musicTab.value = tab;
  onFilterChange();
}

function isSquare(item: any): boolean {
  return isAudioType(item.Type) || item.Type === 'Playlist';
}

function playSongs(index: number) {
  audioStore.playAlbum(items.value.map((song) => toAudioTrack(song)), index);
}

function enqueueSong(song: any, where: 'next' | 'end') {
  if (where === 'next') audioStore.playNext([toAudioTrack(song)]);
  else audioStore.addToQueue([toAudioTrack(song)]);
  toast.show(where === 'next' ? 'Playing next' : 'Added to queue', 'success', 2000);
}
const nameStartsWith = ref('');
const hasActiveFilters = computed(() =>
  sortBy.value !== 'SortName' || sortOrder.value !== 'Ascending' || filter.value !== '' ||
  selectedGenre.value !== '' || nameStartsWith.value !== ''
);
const availableGenres = ref<string[]>([]);

type LibraryState = {
  sortBy: string;
  sortOrder: string;
  filter: string;
  selectedGenre: string;
  nameStartsWith: string;
  startIndex: number;
  musicTab: MusicTab;
};

function stateKey(id: string) {
  return `library-state:${JSON.stringify([store.serverUrl, store.userId, id])}`;
}

function restoreLibraryState() {
  sortBy.value = 'SortName';
  sortOrder.value = 'Ascending';
  filter.value = '';
  selectedGenre.value = '';
  nameStartsWith.value = '';
  startIndex.value = 0;
  musicTab.value = 'albums';

  try {
    const saved = sessionStorage.getItem(stateKey(libraryId.value));
    if (saved) {
      const state = JSON.parse(saved) as Partial<LibraryState>;
      if (['SortName', 'PremiereDate', 'DateCreated', 'CommunityRating', 'PlayCount', 'Random'].includes(state.sortBy ?? '')) {
        sortBy.value = state.sortBy!;
      }
      if (state.sortOrder === 'Ascending' || state.sortOrder === 'Descending') sortOrder.value = state.sortOrder;
      if (['', 'IsUnplayed', 'IsPlayed', 'IsFavorite'].includes(state.filter ?? '')) filter.value = state.filter!;
      if (typeof state.selectedGenre === 'string') selectedGenre.value = state.selectedGenre;
      if (typeof state.nameStartsWith === 'string') nameStartsWith.value = state.nameStartsWith;
      if (MUSIC_TABS.some((t) => t.value === state.musicTab)) musicTab.value = state.musicTab!;
      if (typeof state.startIndex === 'number' && Number.isInteger(state.startIndex) && state.startIndex >= 0) {
        startIndex.value = state.startIndex;
      }
    }
  } catch (e) {
    logger.warn('Failed to restore library state', e);
  }
  showFilters.value = hasActiveFilters.value;
}

function saveLibraryState() {
  try {
    sessionStorage.setItem(stateKey(libraryId.value), JSON.stringify({
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      filter: filter.value,
      selectedGenre: selectedGenre.value,
      nameStartsWith: nameStartsWith.value,
      startIndex: startIndex.value,
      musicTab: musicTab.value,
    } satisfies LibraryState));
  } catch (e) {
    logger.warn('Failed to save library state', e);
  }
}

// View mode
const viewMode = computed(() => prefs.libraryViewMode);
function toggleViewMode() {
  prefs.libraryViewMode = prefs.libraryViewMode === 'grid' ? 'list' : 'grid';
}

// A-Z sidebar
const alphabet = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

function jumpToLetter(letter: string) {
  if (nameStartsWith.value === letter) {
    nameStartsWith.value = '';
  } else {
    nameStartsWith.value = letter;
  }
  startIndex.value = 0;
  loadPage();
}

const currentPage = computed(() => Math.floor(startIndex.value / limit.value) + 1);

function getImageUrl(id: string, itemType?: string) {
  const isAudio = itemType && isAudioType(itemType);
  return store.getImageUrl(id, 'Primary', isAudio ? 150 : 130, isAudio ? 150 : 195) || '';
}

function formatRuntime(ticks: number): string {
  const minutes = Math.round(ticks / 600_000_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

async function loadPage() {
  saveLibraryState();
  const id = libraryId.value;
  const request = ++pageRequest;
  loading.value = true;
  error.value = null;
  try {
    const pageItems = await fetchPage(id, {
      startIndex: startIndex.value,
      limit: limit.value,
      sortBy: [sortBy.value],
      sortOrder: [sortOrder.value],
      filters: filter.value ? [filter.value] : undefined,
      genres: selectedGenre.value ? [selectedGenre.value] : undefined,
      nameStartsWith: nameStartsWith.value === '#' ? '#' : nameStartsWith.value || undefined,
    });
    if (request !== pageRequest) return;
    items.value = pageItems;
    hasNextPage.value = pageItems.length === limit.value;
  } catch (e) {
    if (request === pageRequest) error.value = 'Failed to load items';
  } finally {
    if (request === pageRequest) loading.value = false;
  }
}

type PageOptions = Parameters<typeof store.fetchItems>[1] & { startIndex: number; limit: number; sortOrder: string[] };

function fetchPage(id: string, opts: PageOptions) {
  if (!isMusicLibrary.value) return store.fetchItems(id, opts);
  switch (musicTab.value) {
    case 'artists': return store.fetchAlbumArtists(id, opts);
    case 'playlists': return store.fetchAudioPlaylists(opts);
    case 'songs': return store.fetchItems(id, { ...opts, includeItemTypes: ['Audio'] });
    default: return store.fetchItems(id, { ...opts, includeItemTypes: ['MusicAlbum'] });
  }
}

async function loadGenres() {
  const id = libraryId.value;
  try {
    const genres = await store.fetchGenres(id);
    if (id === libraryId.value) availableGenres.value = genres;
  } catch (e) {
    logger.error('Failed to load genres', e);
  }
}

function onFilterChange() {
  nameStartsWith.value = '';
  startIndex.value = 0;
  loadPage();
}

function quickFilter(value: string) {
  filter.value = filter.value === value ? '' : value;
  onFilterChange();
}

function resetFilters() {
  sortBy.value = 'SortName';
  sortOrder.value = 'Ascending';
  filter.value = '';
  selectedGenre.value = '';
  nameStartsWith.value = '';
  startIndex.value = 0;
  showFilters.value = false;
  loadPage();
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

async function playItem(item: any) {
  if (playingId.value) return;
  playingId.value = item.Id;
  try {
    if (item.Type === 'Series') {
      const nextEp = await store.fetchNextUp(item.Id);
      if (nextEp) {
        router.push({ name: 'Player', params: { id: nextEp.Id } });
      } else {
        router.push({ name: 'ItemDetails', params: { id: item.Id } });
      }
    } else {
      router.push({ name: 'Player', params: { id: item.Id } });
    }
  } finally {
    playingId.value = null;
  }
}

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

onMounted(async () => {
  restoreLibraryState();
  loadGenres();
  // Needed to tell a music library apart (deep link / reload).
  if (!store.libraries.length) {
    try {
      await store.fetchLibraries();
    } catch (e) {
      logger.error('Failed to load libraries', e);
    }
  }
  loadPage();
});

watch(() => route.params.id, (newId) => {
  if (!newId) return;
  items.value = [];
  availableGenres.value = [];
  restoreLibraryState();
  loadGenres();
  loadPage();
});
</script>
