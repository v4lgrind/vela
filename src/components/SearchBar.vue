<template>
  <!-- Backdrop -->
  <Transition name="sb-fade">
    <div v-if="sidebarOpen" class="fixed inset-0 bg-black/60 z-[500]" @click="sidebarOpen = false" />
  </Transition>

  <!-- Sidebar panel -->
  <Transition name="sb-slide">
    <div v-if="sidebarOpen"
      class="fixed inset-y-0 left-0 w-72 bg-surface border-r border-border-input z-[501] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 border-b border-border-input"
        style="padding-top: calc(14px + var(--sat, env(safe-area-inset-top, 0px))); padding-bottom: 14px">
        <button
          class="flex items-center gap-2 text-sm font-semibold text-text-heading hover:text-accent-purple transition-colors cursor-pointer"
          @click="sidebarOpen = false; goHome()">
          <Home class="size-4" />
          Home
        </button>
        <button class="p-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer" @click="sidebarOpen = false">
          <X class="size-5 text-text-muted" />
        </button>
      </div>

      <!-- Libraries -->
      <div class="flex-1 overflow-y-auto p-3">
        <div class="flex items-center justify-between px-2 mb-1.5">
          <p class="text-xs font-semibold text-text-muted uppercase tracking-wider">Libraries</p>
          <button v-if="!editingOrder"
            class="text-xs text-text-muted hover:text-text-heading transition-colors p-1 rounded cursor-pointer"
            @click="startEditingOrder">
            Edit order
          </button>
          <button v-else
            class="text-xs font-semibold text-accent-purple hover:opacity-80 transition-opacity p-1 rounded cursor-pointer"
            @click="editingOrder = false">
            Done
          </button>
        </div>

        <div v-for="(lib, i) in orderedLibraries" :key="lib.Id" class="flex items-center gap-1">
          <!-- Up/down controls (edit mode only) -->
          <div v-if="editingOrder" class="flex flex-col shrink-0">
            <button
              class="p-2 rounded hover:bg-surface-hover transition-colors disabled:opacity-25 cursor-pointer"
              :disabled="i === 0"
              @click="moveLibrary(lib.Id, -1)">
              <ChevronUp class="size-5 text-text-muted" />
            </button>
            <button
              class="p-2 rounded hover:bg-surface-hover transition-colors disabled:opacity-25 cursor-pointer"
              :disabled="i === orderedLibraries.length - 1"
              @click="moveLibrary(lib.Id, 1)">
              <ChevronDown class="size-5 text-text-muted" />
            </button>
          </div>

          <button
            class="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium text-text-heading transition-colors"
            :class="editingOrder ? 'cursor-default' : 'hover:bg-surface-hover cursor-pointer'"
            @click="!editingOrder && goToLibrary(lib)">
            <component :is="libraryIcon(lib)" class="size-4 shrink-0 text-text-muted" />
            {{ lib.Name }}
          </button>
        </div>
      </div>

      <!-- Footer actions -->
      <div class="border-t border-border-input p-3 flex flex-col gap-1"
        style="padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px))">

        <!-- Theme toggle -->
        <div class="flex items-center justify-between px-3 py-2.5">
          <span class="text-sm font-medium text-text-heading">Appearance</span>
          <div class="flex items-center gap-1 bg-surface-hover rounded-lg p-0.5">
            <button
              v-for="opt in themeOptions" :key="opt.value"
              class="p-1.5 rounded-md transition-colors cursor-pointer"
              :class="preferencesStore.colorScheme === opt.value
                ? 'bg-accent-purple text-white shadow-sm'
                : 'text-text-muted hover:text-text-heading'"
              :title="opt.label"
              @click="preferencesStore.colorScheme = opt.value">
              <component :is="opt.icon" class="size-4" />
            </button>
          </div>
        </div>

        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium text-text-heading hover:bg-surface-hover transition-colors cursor-pointer"
          @click="goToSettings">
          <Settings class="size-4 text-text-muted" />
          Settings
        </button>
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          @click="logoutConfirmOpen = true">
          <LogOut class="size-4" />
          Logout
        </button>

        <!-- Logout confirmation -->
        <Transition name="confirm-fade">
          <div v-if="logoutConfirmOpen" class="mt-1 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <p class="text-sm text-red-300 mb-3">Are you sure you want to log out?</p>
            <div class="flex gap-2">
              <button
                class="flex-1 rounded-lg bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-medium py-2 transition-colors cursor-pointer"
                @click="onLogout">
                Log out
              </button>
              <button
                class="flex-1 rounded-lg bg-surface-hover hover:bg-border-default text-text-heading text-sm font-medium py-2 transition-colors cursor-pointer"
                @click="logoutConfirmOpen = false">
                Cancel
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>

  <nav class="flex items-center gap-2 md:gap-4 bg-surface-raised px-3 md:px-5 pb-2.5"
    style="padding-top: calc(10px + var(--sat, env(safe-area-inset-top, 0px)))">
    <!-- Hamburger -->
    <Button variant="ghost" class="shrink-0 px-2 sm:px-3" aria-label="Open menu" @click="openSidebar">
      <Menu class="size-5 sm:size-4" />
    </Button>

    <!-- Home -->
    <Button variant="ghost" class="shrink-0 px-2 sm:px-3" aria-label="Go home" @click="goHome">
      <Home class="size-5 sm:size-4" />
    </Button>

    <Button v-if="canGoBack" variant="ghost" class="shrink-0 px-2 sm:px-3" aria-label="Go back"
      @click="router.back()">
      <ArrowLeft class="size-5 sm:size-4" />
    </Button>
<Button v-if="(offlineStore.initialized && offlineStore.downloadCount > 0) || downloadStore.hasActiveDownloads" variant="ghost"
      :class="!offlineStore.isFullyOnline ? 'bg-[#b45309] hover:bg-[#92400e] text-white shrink-0 px-2 sm:px-3' : 'bg-accent-purple/20 text-white shrink-0 px-2 sm:px-3'" aria-label="Downloads"
      @click="$router.push('/offline')">
      <Download class="size-5 sm:size-4 sm:mr-1" :class="downloadStore.hasActiveDownloads ? 'animate-pulse' : ''" /><span class="hidden sm:inline">Offline</span>
      <Badge v-if="offlineStore.downloadCount > 0" :class="!offlineStore.isFullyOnline ? 'ml-1 bg-white/20 text-white text-xs' : 'ml-1 bg-accent-purple text-white text-xs'">{{ offlineStore.downloadCount }}</Badge>
      <Badge v-else-if="downloadStore.hasActiveDownloads" class="ml-1 bg-white/20 text-white text-xs">↓</Badge>
    </Button>

    <div ref="searchContainerEl" class="relative flex-1 min-w-0" role="combobox" aria-expanded="true" aria-owns="search-listbox"
      aria-haspopup="listbox">
      <Input ref="inputEl" v-model="query" type="search" :placeholder="placeholder"
        aria-autocomplete="list" aria-controls="search-listbox" aria-label="Search libraries"
        class="w-full focus:border-accent-purple focus:ring-accent-purple/15"
        @input="onInput" @focus="onFocus"
        @keydown.down.prevent="moveActive(1)" @keydown.up.prevent="moveActive(-1)"
        @keydown.enter.prevent="onEnter" @keydown.esc="close" />

      <div v-if="open && (hasResults || isSearching)"
        class="absolute left-0 right-0 mt-2 bg-surface-raised border border-border-input rounded-xl max-h-[70vh] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-[1000] max-md:-mx-3 max-md:rounded-none max-md:max-h-[calc(100vh-120px)]">
        <!-- Searching -->
        <div v-if="isSearching" class="flex items-center justify-center gap-2.5 py-8 text-text-muted">
          <Loader2 class="size-5 animate-spin" />
          <span>Searching...</span>
        </div>

        <!-- Results -->
        <div v-else-if="hasResults" id="search-listbox" class="max-h-[70vh] overflow-y-auto p-2 scrollbar-hide"
          role="listbox">
          <!-- Movies -->
          <div v-if="groupedResults.movies.length" class="mb-4 last:mb-0">
            <div
              class="font-bold text-sm text-text-muted uppercase tracking-wide px-3 py-2 sticky top-0 bg-surface-raised z-[1]">
              Movies ({{ groupedResults.movies.length }})</div>
            <div class="flex flex-col gap-1">
              <div v-for="r in groupedResults.movies" :key="r.Id"
                class="grid grid-cols-[100px_1fr] max-md:grid-cols-[60px_1fr] gap-3 max-md:gap-2.5 items-center px-2.5 py-2.5 max-md:px-2 max-md:py-2 rounded-lg cursor-pointer transition-all duration-200 active:opacity-75"
                :class="flatIndex(r) === activeIndex ? 'bg-surface-hover translate-x-0.5' : ''"
                role="option" @mouseenter="activeIndex = flatIndex(r)" @click="goToResult(r)">
                <img :src="thumb(r)" alt=""
                  class="w-[100px] h-[150px] max-md:w-[60px] max-md:h-[90px] rounded-md object-cover bg-black/60 shadow-md"
                  loading="lazy" @error="onThumbError($event, r.Type)" />
                <div class="flex flex-col gap-1.5 min-w-0">
                  <div class="text-text-heading font-semibold text-base max-md:text-sm line-clamp-2">{{ r.Name }}</div>
                  <div class="flex flex-wrap gap-2 items-center text-sm max-md:text-xs">
                    <span v-if="r.ProductionYear" class="text-text-muted">{{ r.ProductionYear }}</span>
                    <span v-if="r.CommunityRating" class="text-rating font-semibold">{{
                      r.CommunityRating.toFixed(1) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TV Shows -->
          <div v-if="groupedResults.series.length" class="mb-4 last:mb-0">
            <div
              class="font-bold text-sm text-text-muted uppercase tracking-wide px-3 py-2 sticky top-0 bg-surface-raised z-[1]">
              TV Shows ({{ groupedResults.series.length }})</div>
            <div class="flex flex-col gap-1">
              <div v-for="r in groupedResults.series" :key="r.Id"
                class="grid grid-cols-[100px_1fr] max-md:grid-cols-[60px_1fr] gap-3 max-md:gap-2.5 items-center px-2.5 py-2.5 max-md:px-2 max-md:py-2 rounded-lg cursor-pointer transition-all duration-200 active:opacity-75"
                :class="flatIndex(r) === activeIndex ? 'bg-surface-hover translate-x-0.5' : ''"
                role="option" @mouseenter="activeIndex = flatIndex(r)" @click="goToResult(r)">
                <img :src="thumb(r)" alt=""
                  class="w-[100px] h-[150px] max-md:w-[60px] max-md:h-[90px] rounded-md object-cover bg-black/60 shadow-md"
                  loading="lazy" @error="onThumbError($event, r.Type)" />
                <div class="flex flex-col gap-1.5 min-w-0">
                  <div class="text-text-heading font-semibold text-base max-md:text-sm line-clamp-2">{{ r.Name }}</div>
                  <div class="flex flex-wrap gap-2 items-center text-sm max-md:text-xs">
                    <span v-if="r.ProductionYear" class="text-text-muted">{{ r.ProductionYear }}</span>
                    <span v-if="r.CommunityRating" class="text-rating font-semibold">{{
                      r.CommunityRating.toFixed(1) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Albums -->
          <div v-if="groupedResults.albums.length" class="mb-4 last:mb-0">
            <div
              class="font-bold text-sm text-text-muted uppercase tracking-wide px-3 py-2 sticky top-0 bg-surface-raised z-[1]">
              Albums ({{ groupedResults.albums.length }})</div>
            <div class="flex flex-col gap-1">
              <div v-for="r in groupedResults.albums" :key="r.Id"
                class="grid grid-cols-[100px_1fr] max-md:grid-cols-[60px_1fr] gap-3 max-md:gap-2.5 items-center px-2.5 py-2.5 max-md:px-2 max-md:py-2 rounded-lg cursor-pointer transition-all duration-200 active:opacity-75"
                :class="flatIndex(r) === activeIndex ? 'bg-surface-hover translate-x-0.5' : ''"
                role="option" @mouseenter="activeIndex = flatIndex(r)" @click="goToResult(r)">
                <img :src="thumb(r)" alt=""
                  class="w-[100px] h-[100px] max-md:w-[60px] max-md:h-[60px] rounded-md object-cover bg-black/60 shadow-md"
                  loading="lazy" @error="onThumbError($event, r.Type)" />
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

        <!-- See all results -->
        <button v-if="query.trim()" @click="goToSearchPage"
          class="w-full text-left px-4 py-3 text-sm text-accent-purple-light border-t border-border-input hover:bg-surface-hover transition-colors cursor-pointer">
          See all results for "{{ query }}" →
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useOfflineStore } from '@/store/offline-store';
import { useDownloadStore } from '@/store/download-store';
import { logger } from '@/utils/logger';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Home, Download, LogOut, Loader2, ArrowLeft, Settings, Menu, X, Film, Tv2, Music2, BookOpen, Folder, ChevronUp, ChevronDown, Sun, Moon, Monitor } from 'lucide-vue-next';
import type { Component } from 'vue';
import { usePreferencesStore } from '@/store/preferences-store';

const placeholder = 'Search movies, shows, albums...';
const route = useRoute();
const router = useRouter();
const canGoBack = computed(() => route.path !== '/libraries' && route.path !== '/');
const store = useJellyfinStore();
const offlineStore = useOfflineStore();
const downloadStore = useDownloadStore();
const preferencesStore = usePreferencesStore();

// ── Theme ──────────────────────────────────────────────────────────────────────

const themeOptions = [
  { value: 'light' as const, icon: Sun,     label: 'Light' },
  { value: 'system' as const, icon: Monitor, label: 'System' },
  { value: 'dark' as const,  icon: Moon,    label: 'Dark'  },
];

// ── Sidebar ────────────────────────────────────────────────────────────────────

const sidebarOpen = ref(false);
const editingOrder = ref(false);
const logoutConfirmOpen = ref(false);

const orderedLibraries = computed(() => {
    const order = preferencesStore.libraryOrder;
    const libs = [...store.libraries];
    if (!order.length) return libs;
    return libs.sort((a, b) => {
        const ai = order.indexOf(a.Id);
        const bi = order.indexOf(b.Id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    });
});

function openSidebar() {
    sidebarOpen.value = true;
}

function startEditingOrder() {
    if (preferencesStore.libraryOrder.length === 0) {
        preferencesStore.libraryOrder = store.libraries.map(l => l.Id);
    }
    editingOrder.value = true;
}

function moveLibrary(id: string, direction: -1 | 1) {
    const order = [...preferencesStore.libraryOrder];
    const idx = order.indexOf(id);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    preferencesStore.libraryOrder = order;
}

function goToLibrary(lib: any) {
    sidebarOpen.value = false;
    router.push(`/libraryItem/${encodeURIComponent(lib.Name)}/${lib.Id}`);
}

function goHome() {
    const isOffline = !offlineStore.isFullyOnline || preferencesStore.forceOfflineMode;
    router.push(isOffline ? '/offline' : '/libraries');
}

function goToSettings() {
    sidebarOpen.value = false;
    router.push('/settings');
}

function libraryIcon(lib: any): Component {
    switch (lib.CollectionType) {
        case 'movies': return Film;
        case 'tvshows': return Tv2;
        case 'music': return Music2;
        case 'books': return BookOpen;
        default: return Folder;
    }
}

// Close sidebar (and exit edit mode) whenever the route changes
watch(() => route.path, () => { sidebarOpen.value = false; editingOrder.value = false; });
watch(sidebarOpen, open => { if (!open) { editingOrder.value = false; logoutConfirmOpen.value = false; } });

// ── Search ─────────────────────────────────────────────────────────────────────

const inputEl = ref<HTMLInputElement | null>(null);
const searchContainerEl = ref<HTMLElement | null>(null);
const query = ref('');
const results = ref<any[]>([]);
const open = ref(false);
const activeIndex = ref(-1);
const isSearching = ref(false);
let debounceId: number | undefined;

function onFocus() {
    if (query.value && (hasResults.value || isSearching.value)) {
        open.value = true;
    }
}

function onClickOutside(e: MouseEvent) {
    if (searchContainerEl.value && !searchContainerEl.value.contains(e.target as Node)) {
        open.value = false;
    }
}

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
        activeIndex.value = -1;
    } catch (e) {
        logger.error('Search error:', e);
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

function onEnter() {
    const r = flatResults.value[activeIndex.value];
    if (r) goToResult(r);
    else goToSearchPage();
}

function goToSearchPage() {
    if (!query.value.trim()) return;
    const q = query.value.trim();
    close();
    query.value = '';
    router.push({ name: 'search', query: { q } });
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
    if (store.libraries.length === 0) store.fetchLibraries();

    window.addEventListener('keydown', (e) => {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
            e.preventDefault();
            inputEl.value?.focus();
        }
    });

    document.addEventListener('mousedown', onClickOutside);
});

onUnmounted(() => {
    document.removeEventListener('mousedown', onClickOutside);
});

watch(query, (val) => {
    if (!val) {
        results.value = [];
        open.value = false;
        isSearching.value = false;
    }
});
</script>

<style scoped>
.sb-fade-enter-active,
.sb-fade-leave-active {
  transition: opacity 250ms ease;
}
.sb-fade-enter-from,
.sb-fade-leave-to {
  opacity: 0;
}

.sb-slide-enter-active,
.sb-slide-leave-active {
  transition: transform 300ms ease;
}
.sb-slide-enter-from,
.sb-slide-leave-to {
  transform: translateX(-100%);
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
