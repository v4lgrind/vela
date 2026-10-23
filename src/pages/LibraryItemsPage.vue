<template>
  <AppPage class="flex min-h-dvh flex-col bg-background pb-6 text-text-primary" :class="showIndex && 'pr-12 md:pr-12'">
    <PageHeader back compact :title="libraryName" :subtitle="countLabel" class="mb-2">
      <template v-if="isMusicLibrary" #actions>
        <Button variant="secondary" size="icon" class="rounded-full" :aria-label="t('library.music.shuffleAll')"
          :disabled="shuffleLoading" @click="shuffleLibrary">
          <Loader2 v-if="shuffleLoading" class="size-5 animate-spin" />
          <Shuffle v-else class="size-5" />
        </Button>
      </template>
    </PageHeader>

    <!-- Music library sections: tabs switch what is listed -->
    <Tabs v-if="isMusicLibrary" :model-value="musicTab" class="mb-3" @update:model-value="selectMusicTab($event as MusicTab)">
      <TabsList>
        <TabsTrigger v-for="tab in MUSIC_TABS" :key="tab.value" :value="tab.value">{{ t(tab.label) }}</TabsTrigger>
      </TabsList>
    </Tabs>

    <!-- Quick toggle, active filters summary, view mode, sort & filter sheet -->
    <section class="mb-4 flex items-center gap-2">
      <Toggle v-if="!isMusicLibrary" variant="outline" class="shrink-0 gap-1.5"
        :model-value="unplayedOnly" @update:model-value="toggleUnplayed">
        <EyeOff /> {{ t('library.unwatched') }}
      </Toggle>
      <Toggle v-else variant="outline" class="shrink-0 gap-1.5"
        :model-value="favoritesOnly" @update:model-value="toggleFavorites">
        <Heart /> {{ t('library.favorites') }}
      </Toggle>
      <button v-if="filterSummary" class="min-h-11 min-w-0 flex-1 truncate text-left text-caption text-text-muted"
        @click="sheetOpen = true">
        {{ filterSummary }}
      </button>
      <div v-else class="flex-1" />

      <Button v-if="!showSongList" variant="ghost" size="icon" class="shrink-0 rounded-full" :aria-label="t('library.toggleView')" @click="toggleViewMode">
        <List v-if="viewMode === 'grid'" class="size-5" />
        <LayoutGrid v-else class="size-5" />
      </Button>
      <Button variant="secondary" size="icon" class="relative shrink-0 rounded-full"
        :aria-label="t('library.sortAndFilter')" @click="sheetOpen = true">
        <SlidersHorizontal class="size-5" />
        <span v-if="activeFilterCount"
          class="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-purple px-1 text-[11px] font-bold text-accent-ink">
          {{ activeFilterCount }}
        </span>
      </Button>
    </section>

    <Drawer v-model:open="sheetOpen" :should-scale-background="false">
      <DrawerContent class="max-h-[85dvh] border-border-default bg-surface md:mx-auto md:max-w-xl">
        <div class="flex flex-col gap-3 overflow-y-auto px-4 pt-3 pb-[calc(16px+var(--sab,env(safe-area-inset-bottom,0px)))]">
          <div class="flex items-center justify-between">
            <DrawerTitle class="text-section font-bold text-text-heading">{{ t('library.sortAndFilter') }}</DrawerTitle>
            <Button v-if="activeFilterCount || unplayedOnly || favoritesOnly" variant="link" size="sm"
              class="text-accent-purple" @click="resetFilters">
              {{ t('library.reset') }}
            </Button>
          </div>
          <DrawerDescription class="sr-only">{{ t('library.sortAndFilter') }}</DrawerDescription>

          <h3 class="text-label font-semibold uppercase tracking-wide text-text-muted">{{ t('library.sortBy') }}</h3>
          <div class="flex flex-wrap gap-2">
            <Toggle v-for="option in SORT_OPTIONS" :key="option.value" variant="outline" size="sm"
              :model-value="sortBy === option.value" @update:model-value="setSort(option.value)">
              {{ t(option.label) }}
            </Toggle>
          </div>
          <div class="grid grid-cols-2 gap-1 rounded-full border border-border-default bg-surface-hover p-1">
            <button v-for="order in SORT_ORDERS" :key="order.value"
              class="h-9 rounded-full text-sm font-medium transition-colors"
              :class="sortOrder === order.value ? 'bg-accent-purple text-accent-ink' : 'text-text-muted'"
              :aria-pressed="sortOrder === order.value" @click="setOrder(order.value)">
              {{ order.arrow }} {{ t(order.label) }}
            </button>
          </div>

          <h3 class="mt-2 text-label font-semibold uppercase tracking-wide text-text-muted">{{ t('library.show') }}</h3>
          <div class="flex flex-wrap gap-2">
            <Toggle v-if="!isMusicLibrary" variant="outline" size="sm" :model-value="unplayedOnly" @update:model-value="toggleUnplayed">
              {{ t('library.unwatched') }}
            </Toggle>
            <Toggle variant="outline" size="sm" :model-value="favoritesOnly" @update:model-value="toggleFavorites">
              {{ t('library.favorites') }}
            </Toggle>
          </div>

          <template v-if="availableGenres.length">
            <h3 class="mt-2 text-label font-semibold uppercase tracking-wide text-text-muted">{{ t('library.genres') }}</h3>
            <div class="flex flex-wrap gap-2">
              <Toggle v-for="genre in availableGenres" :key="genre" variant="outline" size="sm"
                :model-value="selectedGenres.includes(genre)" @update:model-value="toggleGenre(genre)">
                {{ genre }}
              </Toggle>
            </div>
          </template>

          <DrawerClose as-child>
            <Button class="mt-3 h-12 rounded-2xl text-body font-bold">{{ t('library.showResults', { count: countLabel ?? '' }) }}</Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>

    <section class="flex-1 relative">
      <!-- Songs: tap plays this page from that song -->
      <ul v-if="showSongList" class="list-none p-0 m-0 flex flex-col">
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
          <DownloadIcon v-if="offlineStore.isItemDownloaded(song.Id)" class="size-3.5 shrink-0 text-accent-purple" :aria-label="t('common.downloaded')" />
          <Loader2 v-else-if="downloadStore.isDownloading(song.Id)" class="size-3.5 shrink-0 animate-spin text-accent-purple" />
          <span v-if="song.RunTimeTicks" class="text-xs text-text-subtle tabular-nums shrink-0">{{ formatTicksDuration(song.RunTimeTicks) }}</span>
          <TrackActionsMenu :track="song" @play-next="enqueueSong(song, 'next')" @add-to-queue="enqueueSong(song, 'end')" />
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
              class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent flex items-end justify-center gap-4 pb-2.5 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 pointer-events-none">
              <button
                @click.prevent.stop="playItem(item)"
                :disabled="playingId === item.Id"
                class="relative flex size-7 items-center justify-center after:absolute after:-inset-2 after:content-[''] bg-white/90 hover:bg-white text-black rounded-full shadow-lg transition-all active:scale-95 disabled:opacity-60 pointer-events-auto"
                :aria-label="t('common.play')">
                <Loader2 v-if="playingId === item.Id" class="size-3.5 animate-spin" />
                <Play v-else class="size-3.5 fill-black stroke-none" />
              </button>
              <button
                @click.prevent.stop="toggleWatched(item)"
                :disabled="watchingId === item.Id"
                class="relative flex size-7 items-center justify-center after:absolute after:-inset-2 after:content-[''] rounded-full shadow-lg transition-all active:scale-95 disabled:opacity-60 pointer-events-auto"
                :class="item.UserData?.Played ? 'bg-accent-purple text-accent-ink' : 'bg-white/90 hover:bg-white text-black'"
                :aria-label="item.UserData?.Played ? t('common.markUnwatched') : t('common.markWatched')">
                <Check class="size-3.5" />
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
                class="rounded-full p-1 bg-accent-purple/20 text-accent-purple" :title="t('common.downloaded')">
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
                class="flex size-11 items-center justify-center bg-surface-raised border border-border-default rounded-full hover:border-accent-purple transition-colors"
                :aria-label="t('common.play')">
                <Loader2 v-if="playingId === item.Id" class="size-4 animate-spin" />
                <Play v-else class="size-4 fill-text-primary stroke-none" />
              </button>
            </div>
          </router-link>
        </li>
      </ul>

      <p v-if="error && !items.length" class="py-12 text-center text-body text-error">{{ error }}</p>
      <p v-if="!loading && !error && !items.length" class="py-12 text-center text-body text-text-muted">{{ t('library.empty') }}</p>

      <!-- A-Z Quick Jump Sidebar -->
      <AlphaIndex v-if="showIndex" :letters="alphabet" :active="nameStartsWith" @select="jumpToLetter" />

      <!-- Infinite scroll: the next page loads as this comes near the viewport -->
      <div ref="sentinel" class="flex justify-center py-6">
        <Loader2 v-if="loadingMore" class="size-5 animate-spin text-text-muted" />
      </div>
    </section>
  </AppPage>
</template>

<script setup lang="ts">
import { onActivated, onMounted, ref, computed } from 'vue';
import { useIntersectionObserver } from '@vueuse/core';
import { useRetryWhileFailed } from '@/composables/useRetryWhileFailed';
import { useI18n } from 'vue-i18n';
import { logger } from '@/utils/logger';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { usePreferencesStore } from '@/store/preferences-store';
import LazyImg from '@/components/LazyImg.vue';
import { formatTicksDuration, isAudioType } from '@/utils/helpers';
import { toAudioTrack } from '@/utils/audioTrack';
import TrackActionsMenu from '@/components/TrackActionsMenu.vue';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { useToast } from '@/composables/useToast';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { AppPage, PageHeader } from '@/components/layout';
import AlphaIndex from '@/components/AlphaIndex.vue';
import { formatDuration } from '@/i18n/format';
import { Play, Check, Download as DownloadIcon, Loader2, SlidersHorizontal, LayoutGrid, List, Shuffle, EyeOff, Heart } from 'lucide-vue-next';
import { useOfflineStore } from '@/store/offline-store';
import { useDownloadStore } from '@/store/download-store';

const { t } = useI18n();
const store = useJellyfinStore();
const offlineStore = useOfflineStore();
const downloadStore = useDownloadStore();
const audioStore = useAudioPlayerStore();
const toast = useToast();
const prefs = usePreferencesStore();
const route = useRoute();
const router = useRouter();
// Fixed for this instance: App.vue keeps it alive (keyed by path) while an
// item opened from it changes the route.
const libraryId = ref(route.params.id as string);
const libraryName = ref((route.params.name as string) || 'Library');

const playingId = ref<string | null>(null);
const watchingId = ref<string | null>(null);

const items = ref<any[]>([]);
const total = ref(0);
const limit = 50;
const hasMore = computed(() => items.value.length < total.value);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref<string | null>(null);

let pageRequest = 0;
// Filtering and sorting: changes apply at once, the sheet shows the live total.
const sheetOpen = ref(false);
const sortBy = ref('SortName');
const sortOrder = ref('Ascending');
const unplayedOnly = ref(false);
const favoritesOnly = ref(false);
const selectedGenres = ref<string[]>([]);
const SORT_OPTIONS = [
  { value: 'SortName', label: 'library.sort.name' },
  { value: 'PremiereDate', label: 'library.sort.releaseDate' },
  { value: 'DateCreated', label: 'library.sort.dateAdded' },
  { value: 'CommunityRating', label: 'library.sort.rating' },
  { value: 'PlayCount', label: 'library.sort.playCount' },
  { value: 'Random', label: 'library.sort.random' },
];
const SORT_ORDERS = [
  { value: 'Ascending', label: 'library.ascending', arrow: '↑' },
  { value: 'Descending', label: 'library.descending', arrow: '↓' },
];

type MusicTab = 'albums' | 'artists' | 'songs' | 'playlists';
const MUSIC_TABS: { value: MusicTab; label: string }[] = [
  { value: 'albums', label: 'library.music.albums' },
  { value: 'artists', label: 'library.music.artists' },
  { value: 'songs', label: 'library.music.songs' },
  { value: 'playlists', label: 'library.music.playlists' },
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

const shuffleLoading = ref(false);

/** Random songs from this library; audioPlayerService adds more as they run out. */
async function shuffleLibrary() {
  const id = libraryId.value;
  shuffleLoading.value = true;
  try {
    const songs = await store.fetchRandomTracks(id);
    if (songs.length) audioStore.playLibraryShuffle(id, songs.map((song) => toAudioTrack(song)));
  } catch (e) {
    logger.error('Library shuffle failed', e);
    toast.showError(t('library.music.shuffleFailed'));
  } finally {
    shuffleLoading.value = false;
  }
}

function enqueueSong(song: any, where: 'next' | 'end') {
  if (where === 'next') audioStore.playNext([toAudioTrack(song)]);
  else audioStore.addToQueue([toAudioTrack(song)]);
  toast.show(where === 'next' ? t('audio.playingNext') : t('audio.addedToQueue'), 'success', 2000);
}
const nameStartsWith = ref('');
const sortChanged = computed(() => sortBy.value !== 'SortName' || sortOrder.value !== 'Ascending');
// The quick toggle (Non vus, or Favoris in music) is visible on its own: not counted.
const activeFilterCount = computed(() =>
  (sortChanged.value ? 1 : 0) + (selectedGenres.value.length ? 1 : 0) + (!isMusicLibrary.value && favoritesOnly.value ? 1 : 0));
const filterSummary = computed(() => {
  const parts: string[] = [];
  if (sortChanged.value) {
    const sort = SORT_OPTIONS.find((o) => o.value === sortBy.value);
    parts.push(`${sort ? t(sort.label) : sortBy.value} ${sortOrder.value === 'Ascending' ? '↑' : '↓'}`);
  }
  if (!isMusicLibrary.value && favoritesOnly.value) parts.push(t('library.favorites'));
  if (selectedGenres.value.length) parts.push(selectedGenres.value.join(', '));
  return parts.join(' · ');
});
const availableGenres = ref<string[]>([]);

type LibraryState = {
  sortBy: string;
  sortOrder: string;
  unplayedOnly: boolean;
  favoritesOnly: boolean;
  selectedGenres: string[];
  nameStartsWith: string;
  musicTab: MusicTab;
};

function stateKey(id: string) {
  return `library-state:${JSON.stringify([store.serverUrl, store.userId, id])}`;
}

function restoreLibraryState() {
  sortBy.value = 'SortName';
  sortOrder.value = 'Ascending';
  unplayedOnly.value = false;
  favoritesOnly.value = false;
  selectedGenres.value = [];
  nameStartsWith.value = '';
  musicTab.value = 'albums';

  try {
    const saved = sessionStorage.getItem(stateKey(libraryId.value));
    if (saved) {
      const state = JSON.parse(saved) as Partial<LibraryState>;
      if (['SortName', 'PremiereDate', 'DateCreated', 'CommunityRating', 'PlayCount', 'Random'].includes(state.sortBy ?? '')) {
        sortBy.value = state.sortBy!;
      }
      if (state.sortOrder === 'Ascending' || state.sortOrder === 'Descending') sortOrder.value = state.sortOrder;
      unplayedOnly.value = state.unplayedOnly === true;
      favoritesOnly.value = state.favoritesOnly === true;
      if (Array.isArray(state.selectedGenres)) selectedGenres.value = state.selectedGenres.filter((g) => typeof g === 'string');
      if (typeof state.nameStartsWith === 'string') nameStartsWith.value = state.nameStartsWith;
      if (MUSIC_TABS.some((t) => t.value === state.musicTab)) musicTab.value = state.musicTab!;
    }
  } catch (e) {
    logger.warn('Failed to restore library state', e);
  }
}

function saveLibraryState() {
  try {
    sessionStorage.setItem(stateKey(libraryId.value), JSON.stringify({
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      unplayedOnly: unplayedOnly.value,
      favoritesOnly: favoritesOnly.value,
      selectedGenres: selectedGenres.value,
      nameStartsWith: nameStartsWith.value,
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
// Short lists don't need an index; keep it while a letter is applied so it can be changed or cleared.
const showIndex = computed(() =>
  sortBy.value === 'SortName' && (items.value.length >= 30 || hasMore.value || nameStartsWith.value !== ''));

function jumpToLetter(letter: string) {
  if (nameStartsWith.value === letter) {
    nameStartsWith.value = '';
  } else {
    nameStartsWith.value = letter;
  }
  loadPage();
}

const countLabel = computed(() => {
  if (loading.value && !items.value.length) return undefined;
  const key = isMusicLibrary.value ? `library.count.${musicTab.value}` : 'library.count.items';
  return t(key, total.value);
});

function getImageUrl(id: string, itemType?: string) {
  const isAudio = itemType && isAudioType(itemType);
  return store.getImageUrl(id, 'Primary', isAudio ? 150 : 130, isAudio ? 150 : 195) || '';
}

function formatRuntime(ticks: number): string {
  return formatDuration(Math.round(ticks / 600_000_000) * 60);
}

function queryOptions() {
  const filters = [
    ...(unplayedOnly.value && !isMusicLibrary.value ? ['IsUnplayed'] : []),
    ...(favoritesOnly.value ? ['IsFavorite'] : []),
  ];
  return {
    limit,
    sortBy: [sortBy.value],
    sortOrder: [sortOrder.value],
    filters: filters.length ? filters : undefined,
    genres: selectedGenres.value.length ? selectedGenres.value : undefined,
    nameStartsWith: nameStartsWith.value === '#' ? '#' : nameStartsWith.value || undefined,
  };
}

/** First page for the current tab / filters; replaces what was listed. */
async function loadPage() {
  saveLibraryState();
  const id = libraryId.value;
  const request = ++pageRequest;
  loading.value = true;
  loadingMore.value = false;
  error.value = null;
  try {
    const page = await fetchPage(id, { ...queryOptions(), startIndex: 0 });
    if (request !== pageRequest) return;
    items.value = page.items;
    total.value = page.total;
  } catch (e) {
    if (request === pageRequest) error.value = t('library.loadError');
  } finally {
    if (request === pageRequest) loading.value = false;
  }
  if (request === pageRequest && !error.value && sentinelVisible) loadMore();
}

async function loadMore() {
  if (loading.value || loadingMore.value || !hasMore.value) return;
  const request = pageRequest;
  loadingMore.value = true;
  try {
    const page = await fetchPage(libraryId.value, { ...queryOptions(), startIndex: items.value.length });
    if (request !== pageRequest) return;
    items.value = [...items.value, ...page.items];
    total.value = page.total;
    error.value = null;
  } catch (e) {
    if (request === pageRequest) error.value = t('library.loadError');
  } finally {
    if (request === pageRequest) loadingMore.value = false;
  }
  // Still in view (short page or tall screen): keep filling.
  if (request === pageRequest && !error.value && sentinelVisible) loadMore();
}

useRetryWhileFailed(computed(() => error.value !== null), () => (items.value.length ? loadMore() : loadPage()));

const sentinel = ref<HTMLElement | null>(null);
let sentinelVisible = false;
useIntersectionObserver(sentinel, ([entry]) => {
  sentinelVisible = entry?.isIntersecting ?? false;
  if (sentinelVisible) loadMore();
}, { rootMargin: '800px' });

type PageOptions = ReturnType<typeof queryOptions> & { startIndex: number };

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
  loadPage();
}

function toggleUnplayed() {
  unplayedOnly.value = !unplayedOnly.value;
  onFilterChange();
}

function toggleFavorites() {
  favoritesOnly.value = !favoritesOnly.value;
  onFilterChange();
}

function toggleGenre(genre: string) {
  selectedGenres.value = selectedGenres.value.includes(genre)
    ? selectedGenres.value.filter((g) => g !== genre)
    : [...selectedGenres.value, genre];
  onFilterChange();
}

function setSort(value: string) {
  if (sortBy.value === value) return;
  sortBy.value = value;
  onFilterChange();
}

function setOrder(value: string) {
  if (sortOrder.value === value) return;
  sortOrder.value = value;
  onFilterChange();
}

function resetFilters() {
  sortBy.value = 'SortName';
  sortOrder.value = 'Ascending';
  unplayedOnly.value = false;
  favoritesOnly.value = false;
  selectedGenres.value = [];
  nameStartsWith.value = '';
  loadPage();
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

// Kept alive by App.vue: going back from something opened here keeps the list
// as it was; arriving from anywhere else (or after a failed load) reloads it.
const DRILL_DOWN_ROUTES = ['ItemDetails', 'libraryItem', 'PersonDetail', 'Player'];
let reloadOnReturn = false;
onBeforeRouteLeave((to) => {
  reloadOnReturn = !DRILL_DOWN_ROUTES.includes(String(to.name));
});
onActivated(() => {
  if (!reloadOnReturn && !error.value && items.value.length) return;
  reloadOnReturn = false;
  if (!loading.value) loadPage();
});

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

</script>
