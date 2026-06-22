<template>
  <div class="flex flex-col h-dvh bg-background">
    <!-- Header: back + search input -->
    <div class="flex items-center gap-3 px-4 border-b border-border-input bg-surface-raised"
      style="padding-top: calc(12px + var(--sat, env(safe-area-inset-top, 0px))); padding-bottom: 12px">
      <button class="shrink-0 p-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
        @click="router.back()">
        <ArrowLeft class="size-5 text-text-heading" />
      </button>
      <input
        ref="inputEl"
        v-model="searchQuery"
        type="search"
        placeholder="Search movies, shows, episodes..."
        class="flex-1 bg-surface border border-border-input rounded-lg px-3 py-2 text-sm text-text-heading placeholder:text-text-muted outline-none focus:border-accent-purple transition-colors"
        @input="onInput"
        @keydown.esc="router.back()"
      />
    </div>

    <!-- Filter tabs -->
    <div class="flex gap-2 px-4 py-2.5 border-b border-border-input overflow-x-auto scrollbar-hide shrink-0">
      <button
        v-for="tab in tabs" :key="tab.value"
        class="shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer"
        :class="activeTab === tab.value
          ? 'bg-accent-purple text-white'
          : 'bg-surface-hover text-text-muted hover:text-text-heading'"
        @click="activeTab = tab.value">
        {{ tab.label }}
        <span v-if="tab.value !== 'all' && tabCount(tab.value) > 0" class="ml-1 opacity-70 text-xs">
          {{ tabCount(tab.value) }}
        </span>
      </button>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto">
      <!-- No query yet -->
      <div v-if="!searchQuery.trim()" class="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
        <Search class="size-10 opacity-40" />
        <p class="text-sm">Type to search your library</p>
      </div>

      <!-- Searching -->
      <div v-else-if="isSearching" class="flex items-center justify-center gap-2.5 py-16 text-text-muted">
        <Loader2 class="size-5 animate-spin" />
        <span class="text-sm">Searching...</span>
      </div>

      <!-- No results -->
      <div v-else-if="filteredResults.length === 0" class="flex flex-col items-center justify-center h-full gap-3 text-text-muted">
        <Search class="size-10 opacity-40" />
        <p class="text-sm">No results for "{{ searchQuery }}"</p>
      </div>

      <!-- Grid -->
      <ul v-else class="list-none p-4 m-0 grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:gap-4"
        style="padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px))">
        <li v-for="item in filteredResults" :key="item.Id">
          <div
            class="bg-surface-raised border border-border-default hover:border-border-hover rounded-xl overflow-hidden active:scale-[0.97] active:opacity-80 transition-all duration-200 cursor-pointer flex flex-col"
            @click="goToItem(item)">
            <!-- Poster -->
            <div class="relative w-full overflow-hidden bg-black/60"
              :class="item.Type === 'Episode' ? 'aspect-video' : 'aspect-[2/3]'">
              <LazyImg
                :src="itemImageUrl(item)"
                :alt="item.Name"
                :item-type="item.Type"
                class="w-full h-full object-cover block"
              />
              <!-- Download badge -->
              <div v-if="offlineStore.isItemDownloaded(item.Id)"
                class="absolute top-1 left-1 z-10 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none">
                <DownloadIcon class="size-3 text-white" />
              </div>
              <div v-else-if="downloadStore.isDownloading(item.Id)"
                class="absolute top-1 left-1 z-10 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none animate-pulse">
                <Loader2 class="size-3 text-white animate-spin" />
              </div>
              <!-- Watched toggle -->
              <button
                @click.stop="toggleWatched(item)"
                :disabled="watchingId === item.Id"
                class="absolute top-1 right-1 z-10 rounded-full p-1 transition-all active:scale-95 disabled:opacity-60 pointer-events-auto"
                :class="item.UserData?.Played ? 'bg-accent-purple text-white' : 'bg-black/50 text-white/60 hover:bg-black/75 hover:text-white'">
                <Loader2 v-if="watchingId === item.Id" class="size-3 animate-spin" />
                <Check v-else class="size-3" />
              </button>
              <!-- Episode label -->
              <div v-if="item.Type === 'Episode' && (item.ParentIndexNumber || item.IndexNumber)"
                class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                <p class="text-white text-xs font-semibold">
                  S{{ item.ParentIndexNumber }}E{{ item.IndexNumber }}
                </p>
              </div>
            </div>
            <!-- Info -->
            <div class="px-2 py-2">
              <p class="text-text-heading text-xs font-semibold line-clamp-2 leading-tight">{{ item.Name }}</p>
              <p v-if="item.Type === 'Episode' && item.SeriesName"
                class="text-text-muted text-xs mt-0.5 truncate">{{ item.SeriesName }}</p>
              <p v-else-if="item.ProductionYear"
                class="text-text-muted text-xs mt-0.5">{{ item.ProductionYear }}</p>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import LazyImg from '@/components/LazyImg.vue';
import { ArrowLeft, Download as DownloadIcon, Loader2, Search, Check } from 'lucide-vue-next';
import { useOfflineStore } from '@/store/offline-store';
import { useDownloadStore } from '@/store/download-store';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const offlineStore = useOfflineStore();
const downloadStore = useDownloadStore();
const router = useRouter();
const store = useJellyfinStore();
const { showError } = useToast();

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
const activeTab = ref<'all' | 'Movie' | 'Series' | 'Episode'>('all');
let debounceId: number | undefined;

const tabs = [
  { value: 'all' as const,     label: 'All' },
  { value: 'Movie' as const,   label: 'Movies' },
  { value: 'Series' as const,  label: 'TV Shows' },
  { value: 'Episode' as const, label: 'Episodes' },
];

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
  return store.getImageUrl(item.Id, 'Primary', 130, 195) || '';
}

function goToItem(item: any) {
  if (item.Type === 'Episode') {
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
      includeItemTypes: ['Movie', 'Series', 'Episode'],
    });
  } catch {
    results.value = [];
    showError('Search failed. Please check your connection.');
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
