<template>
  <nav class="flex items-center gap-2 md:gap-4 bg-surface-raised px-3 md:px-5 pb-2.5" style="padding-top: calc(10px + env(safe-area-inset-top, 0px))">
    <Button variant="ghost" class="font-bold shrink-0 px-2 sm:px-3" @click="$router.push('/libraries')" aria-label="Home">
      <Home class="size-5 sm:size-4 sm:mr-1" /><span class="hidden sm:inline">Home</span>
    </Button>
    <Button v-if="offlineStore.initialized && offlineStore.downloadCount > 0" variant="ghost" class="bg-accent-purple/20 text-white shrink-0 px-2 sm:px-3" @click="$router.push('/offline')" aria-label="Downloads">
      <Download class="size-5 sm:size-4 sm:mr-1" /><span class="hidden sm:inline">Offline</span>
      <Badge class="ml-1 bg-accent-purple text-white text-xs">{{ offlineStore.downloadCount }}</Badge>
    </Button>

    <div class="relative flex-1 min-w-0" role="combobox" aria-expanded="true" aria-owns="search-listbox" aria-haspopup="listbox">
      <Input ref="inputEl" v-model="query" type="search" :placeholder="placeholder"
        aria-autocomplete="list" aria-controls="search-listbox" aria-label="Search libraries"
        class="w-full focus:border-accent-purple focus:ring-accent-purple/15"
        @input="onInput" @keydown.down.prevent="moveActive(1)" @keydown.up.prevent="moveActive(-1)"
        @keydown.enter.prevent="selectActive" @keydown.esc="close" />

      <div v-if="open && (hasResults || isSearching)" class="absolute left-0 right-0 mt-2 bg-surface-raised border border-border-input rounded-xl max-h-[70vh] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-[1000] max-md:-mx-3 max-md:rounded-none max-md:max-h-[calc(100vh-120px)]">
        <!-- Searching -->
        <div v-if="isSearching" class="flex items-center justify-center gap-2.5 py-8 text-text-muted">
          <Loader2 class="size-5 animate-spin" />
          <span>Searching...</span>
        </div>

        <!-- Results -->
        <div v-else-if="hasResults" id="search-listbox" class="max-h-[70vh] overflow-y-auto p-2 scrollbar-hide" role="listbox">
          <!-- Movies -->
          <div v-if="groupedResults.movies.length" class="mb-4 last:mb-0">
            <div class="font-bold text-sm text-text-muted uppercase tracking-wide px-3 py-2 sticky top-0 bg-surface-raised z-[1]">Movies ({{ groupedResults.movies.length }})</div>
            <div class="flex flex-col gap-1">
              <div v-for="r in groupedResults.movies" :key="r.Id"
                class="grid grid-cols-[100px_1fr] max-md:grid-cols-[60px_1fr] gap-3 max-md:gap-2.5 items-center px-2.5 py-2.5 max-md:px-2 max-md:py-2 rounded-lg cursor-pointer transition-all duration-200"
                :class="flatIndex(r) === activeIndex ? 'bg-surface-hover translate-x-0.5' : ''"
                role="option"
                @mouseenter="activeIndex = flatIndex(r)" @click="goToResult(r)">
                <img :src="thumb(r)" alt="" class="w-[100px] h-[150px] max-md:w-[60px] max-md:h-[90px] rounded-md object-cover bg-black/60 shadow-md" loading="lazy" @error="onThumbError($event, r.Type)" />
                <div class="flex flex-col gap-1.5 min-w-0">
                  <div class="text-text-heading font-semibold text-base max-md:text-sm line-clamp-2">{{ r.Name }}</div>
                  <div class="flex flex-wrap gap-2 items-center text-sm max-md:text-xs">
                    <span v-if="r.ProductionYear" class="text-text-muted">{{ r.ProductionYear }}</span>
                    <span v-if="r.CommunityRating" class="text-rating font-semibold">{{ r.CommunityRating.toFixed(1) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TV Shows -->
          <div v-if="groupedResults.series.length" class="mb-4 last:mb-0">
            <div class="font-bold text-sm text-text-muted uppercase tracking-wide px-3 py-2 sticky top-0 bg-surface-raised z-[1]">TV Shows ({{ groupedResults.series.length }})</div>
            <div class="flex flex-col gap-1">
              <div v-for="r in groupedResults.series" :key="r.Id"
                class="grid grid-cols-[100px_1fr] max-md:grid-cols-[60px_1fr] gap-3 max-md:gap-2.5 items-center px-2.5 py-2.5 max-md:px-2 max-md:py-2 rounded-lg cursor-pointer transition-all duration-200"
                :class="flatIndex(r) === activeIndex ? 'bg-surface-hover translate-x-0.5' : ''"
                role="option"
                @mouseenter="activeIndex = flatIndex(r)" @click="goToResult(r)">
                <img :src="thumb(r)" alt="" class="w-[100px] h-[150px] max-md:w-[60px] max-md:h-[90px] rounded-md object-cover bg-black/60 shadow-md" loading="lazy" @error="onThumbError($event, r.Type)" />
                <div class="flex flex-col gap-1.5 min-w-0">
                  <div class="text-text-heading font-semibold text-base max-md:text-sm line-clamp-2">{{ r.Name }}</div>
                  <div class="flex flex-wrap gap-2 items-center text-sm max-md:text-xs">
                    <span v-if="r.ProductionYear" class="text-text-muted">{{ r.ProductionYear }}</span>
                    <span v-if="r.CommunityRating" class="text-rating font-semibold">{{ r.CommunityRating.toFixed(1) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Albums -->
          <div v-if="groupedResults.albums.length" class="mb-4 last:mb-0">
            <div class="font-bold text-sm text-text-muted uppercase tracking-wide px-3 py-2 sticky top-0 bg-surface-raised z-[1]">Albums ({{ groupedResults.albums.length }})</div>
            <div class="flex flex-col gap-1">
              <div v-for="r in groupedResults.albums" :key="r.Id"
                class="grid grid-cols-[100px_1fr] max-md:grid-cols-[60px_1fr] gap-3 max-md:gap-2.5 items-center px-2.5 py-2.5 max-md:px-2 max-md:py-2 rounded-lg cursor-pointer transition-all duration-200"
                :class="flatIndex(r) === activeIndex ? 'bg-surface-hover translate-x-0.5' : ''"
                role="option"
                @mouseenter="activeIndex = flatIndex(r)" @click="goToResult(r)">
                <img :src="thumb(r)" alt="" class="w-[100px] h-[100px] max-md:w-[60px] max-md:h-[60px] rounded-md object-cover bg-black/60 shadow-md" loading="lazy" @error="onThumbError($event, r.Type)" />
                <div class="flex flex-col gap-1.5 min-w-0">
                  <div class="text-text-heading font-semibold text-base max-md:text-sm line-clamp-2">{{ r.Name }}</div>
                  <div class="flex flex-wrap gap-2 items-center text-sm max-md:text-xs">
                    <span v-if="r.AlbumArtist" class="text-accent-purple-light">{{ r.AlbumArtist }}</span>
                    <span v-if="r.ProductionYear" class="text-text-muted">{{ r.ProductionYear }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- No results -->
        <div v-else class="py-10 text-center text-text-muted">
          No results for "{{ query }}"
        </div>
      </div>
    </div>

    <Button variant="destructive" class="shrink-0 px-2 sm:px-3" @click="onLogout">
      <LogOut class="size-5 sm:size-4 sm:mr-1" /><span class="hidden sm:inline">Logout</span>
    </Button>
  </nav>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useOfflineStore } from '@/store/offline-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Home, Download, LogOut, Loader2 } from 'lucide-vue-next';

const placeholder = 'Search movies, shows, albums...';
const router = useRouter();
const store = useJellyfinStore();
const offlineStore = useOfflineStore();

const inputEl = ref<HTMLInputElement | null>(null);
const query = ref('');
const results = ref<any[]>([]);
const open = ref(false);
const activeIndex = ref(0);
const isSearching = ref(false);
let debounceId: number | undefined;

async function onLogout() {
    await store.logout();
    router.push({ name: 'login' });
}

function thumb(item: any) {
    if (item.Type === 'MusicAlbum') {
        return store.getImageUrl(item.Id, 'Primary', 120, 120) || '';
    }
    return store.getImageUrl(item.Id, 'Primary', 100, 150) || '';
}

function onThumbError(e: Event, itemType: string) {
    (e.target as HTMLImageElement).src = store.getPlaceholderImage(itemType.toLowerCase());
}

const groupedResults = computed(() => {
    return {
        movies: results.value.filter(r => r.Type === 'Movie'),
        series: results.value.filter(r => r.Type === 'Series'),
        albums: results.value.filter(r => r.Type === 'MusicAlbum'),
    };
});

const hasResults = computed(() => results.value.length > 0);

const flatResults = computed(() => {
    return [
        ...groupedResults.value.movies,
        ...groupedResults.value.series,
        ...groupedResults.value.albums,
    ];
});

function flatIndex(item: any): number {
    return flatResults.value.findIndex(r => r.Id === item.Id);
}

async function searchAll(term: string) {
    if (!term.trim()) {
        results.value = [];
        isSearching.value = false;
        return;
    }

    isSearching.value = true;

    try {
        results.value = await store.searchItems({
            searchTerm: term,
            limit: 50,
            includeItemTypes: ['Movie', 'Series', 'MusicAlbum']
        });
        activeIndex.value = 0;
    } catch (e) {
        console.error('Search error:', e);
        results.value = [];
    } finally {
        isSearching.value = false;
    }
}

function onInput() {
    open.value = true;
    window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => searchAll(query.value), 300);
}

function moveActive(delta: number) {
    const flat = flatResults.value;
    if (!flat.length) return;
    activeIndex.value = (activeIndex.value + delta + flat.length) % flat.length;

    setTimeout(() => {
        const activeEl = document.querySelector('.result.active');
        activeEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 10);
}

function selectActive() {
    const flat = flatResults.value;
    const r = flat[activeIndex.value];
    if (r) goToResult(r);
}

function goToResult(r: any) {
    close();
    query.value = '';
    router.push({ name: 'ItemDetails', params: { id: r.Id } });
}

function close() {
    open.value = false;
}

onMounted(() => {
    window.addEventListener('keydown', (e) => {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
            e.preventDefault();
            inputEl.value?.focus();
        }
    });
});

watch(query, (val) => {
    if (!val) {
        results.value = [];
        open.value = false;
        isSearching.value = false;
    }
});
</script>
