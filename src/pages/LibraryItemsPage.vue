<template>
  <div class="min-h-dvh bg-background text-text-primary p-5 flex flex-col">
    <!-- Filters and Sorting -->
    <section class="mb-4">
      <!-- Toggle row -->
      <div class="flex items-center gap-2">
        <button
          @click="showFilters = !showFilters"
          class="flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors"
          :class="hasActiveFilters
            ? 'border-accent-purple text-accent-purple bg-accent-purple/10'
            : 'border-border-default text-text-primary bg-surface-raised hover:border-accent-purple'">
          <SlidersHorizontal class="size-4" />
          Filters
          <span v-if="hasActiveFilters" class="bg-accent-purple text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">!</span>
          <ChevronDown class="size-3.5 transition-transform duration-200" :class="showFilters ? 'rotate-180' : ''" />
        </button>
        <Button v-if="hasActiveFilters" variant="ghost" size="sm" @click="resetFilters" class="text-xs px-2 text-text-muted">Reset</Button>

        <!-- Spacer -->
        <div class="flex-1" />

        <!-- View mode toggle -->
        <button @click="toggleViewMode" class="p-2 rounded-md border border-border-default bg-surface-raised hover:border-accent-purple transition-colors" title="Toggle view">
          <List v-if="viewMode === 'grid'" class="size-4" />
          <LayoutGrid v-else class="size-4" />
        </button>
      </div>

      <!-- Collapsible filter panel -->
      <div v-show="showFilters" class="flex flex-wrap gap-2 items-center mt-3">
        <select v-model="sortBy" @change="onFilterChange" class="bg-surface-raised border border-border-default rounded-md px-3 py-2 text-base text-text-primary cursor-pointer hover:border-accent-purple transition-colors">
          <option value="SortName">Name</option>
          <option value="PremiereDate">Release Date</option>
          <option value="DateCreated">Date Added</option>
          <option value="CommunityRating">Rating</option>
          <option value="PlayCount">Play Count</option>
          <option value="Random">Random</option>
        </select>

        <select v-model="sortOrder" @change="onFilterChange" class="bg-surface-raised border border-border-default rounded-md px-3 py-2 text-base text-text-primary cursor-pointer hover:border-accent-purple transition-colors">
          <option value="Ascending">↑ Asc</option>
          <option value="Descending">↓ Desc</option>
        </select>

        <select v-model="filter" @change="onFilterChange" class="bg-surface-raised border border-border-default rounded-md px-3 py-2 text-base text-text-primary cursor-pointer hover:border-accent-purple transition-colors">
          <option value="">All Items</option>
          <option value="IsUnplayed">Unwatched</option>
          <option value="IsPlayed">Watched</option>
          <option value="IsFavorite">Favorites</option>
        </select>

        <select v-model="selectedGenre" @change="onFilterChange" class="bg-surface-raised border border-border-default rounded-md px-3 py-2 text-base text-text-primary cursor-pointer hover:border-accent-purple transition-colors">
          <option value="">All Genres</option>
          <option v-for="genre in availableGenres" :key="genre" :value="genre">{{ genre }}</option>
        </select>
      </div>
    </section>

    <section class="flex-1 relative">
      <!-- Grid view -->
      <ul v-if="viewMode === 'grid'" class="list-none p-0 m-0 grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-4">
        <li v-for="item in items" :key="item.Id">
          <Card class="bg-surface-raised border-border-default hover:-translate-y-1 hover:bg-surface-hover hover:border-border-hover hover:shadow-xl transition-all duration-200 flex flex-col items-center p-2.5 pb-3 overflow-hidden active:scale-[0.97] active:opacity-80">
            <!-- Poster with overlay -->
            <div class="relative group w-full rounded-[10px] overflow-hidden bg-black/60 shadow-lg"
              :class="isAudioType(item.Type) ? 'aspect-square' : 'aspect-[2/3]'">
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
                class="absolute top-1.5 right-1.5 bg-accent-purple rounded-full p-0.5 shadow pointer-events-none">
                <Check class="size-3 text-white" />
              </div>
              <!-- Download badge -->
              <div v-if="offlineStore.isItemDownloaded(item.Id)"
                class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none">
                <DownloadIcon class="size-3 text-white" />
              </div>
              <div v-else-if="downloadStore.isDownloading(item.Id)"
                class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none animate-pulse">
                <Loader2 class="size-3 text-white animate-spin" />
              </div>

              <!-- Action overlay: always visible on mobile, hover-only on desktop -->
              <div v-if="!isAudioType(item.Type) && item.Type !== 'BoxSet'"
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
                  :class="item.UserData?.Played ? 'bg-accent-purple text-white' : 'bg-white/90 hover:bg-white text-black'"
                  :title="item.UserData?.Played ? 'Mark as unwatched' : 'Mark as watched'">
                  <Check class="size-3" />
                </button>
              </div>
            </div>

            <div class="w-full text-center mt-2.5">
              <div class="text-[0.95rem] font-semibold text-text-heading truncate" :title="item.Name">{{ item.Name }}</div>
              <Badge variant="secondary" class="mt-1 text-xs">{{ item.Type }}</Badge>
            </div>
          </Card>
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
              :class="isAudioType(item.Type) ? 'aspect-square' : 'aspect-[2/3]'">
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
              <button v-if="!isAudioType(item.Type) && item.Type !== 'BoxSet'"
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
import { isAudioType } from '@/utils/helpers';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Play, Check, Download as DownloadIcon, Loader2, SlidersHorizontal, ChevronDown, LayoutGrid, List } from 'lucide-vue-next';
import { useOfflineStore } from '@/store/offline-store';
import { useDownloadStore } from '@/store/download-store';

const store = useJellyfinStore();
const offlineStore = useOfflineStore();
const downloadStore = useDownloadStore();
const prefs = usePreferencesStore();
const route = useRoute();
const router = useRouter();
const libraryId = route.params.id as string;

const playingId = ref<string | null>(null);
const watchingId = ref<string | null>(null);

const items = ref<any[]>([]);
const limit = ref(50);
const startIndex = ref(0);
const hasNextPage = ref(false);
const loading = ref(true);
const error = ref<string | null>(null);

// Filtering and sorting
const showFilters = ref(false);
const sortBy = ref('SortName');
const sortOrder = ref('Ascending');
const filter = ref('');
const selectedGenre = ref('');
const nameStartsWith = ref('');
const hasActiveFilters = computed(() =>
  sortBy.value !== 'SortName' || sortOrder.value !== 'Ascending' || filter.value !== '' || selectedGenre.value !== ''
);
const availableGenres = ref<string[]>([]);

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
  loading.value = true;
  error.value = null;
  try {
    const pageItems = await store.fetchItems(libraryId, {
      startIndex: startIndex.value,
      limit: limit.value,
      sortBy: [sortBy.value],
      sortOrder: [sortOrder.value],
      filters: filter.value ? [filter.value] : undefined,
      genres: selectedGenre.value ? [selectedGenre.value] : undefined,
      nameStartsWith: nameStartsWith.value === '#' ? '#' : nameStartsWith.value || undefined,
    });
    items.value = pageItems;
    hasNextPage.value = pageItems.length === limit.value;
  } catch (e) {
    error.value = 'Failed to load items';
  } finally {
    loading.value = false;
  }
}

async function loadGenres() {
  try {
    availableGenres.value = await store.fetchGenres(libraryId);
  } catch (e) {
    logger.error('Failed to load genres', e);
  }
}

function onFilterChange() {
  nameStartsWith.value = '';
  startIndex.value = 0;
  loadPage();
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

onMounted(() => {
  loadGenres();
  loadPage();
});

watch(() => route.params.id, async (newId) => {
  if (!newId) return;
  startIndex.value = 0;
  nameStartsWith.value = '';
  await loadGenres();
  await loadPage();
});
</script>
