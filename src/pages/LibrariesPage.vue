<template>
  <AppPage class="bg-background pb-6 text-text-primary">
    <PageHeader :title="t('library.title')" class="mb-4" />
    <OfflineBanner class="mb-4" />

    <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <Skeleton v-for="i in 6" :key="i" class="aspect-video rounded-xl" />
    </div>

    <div v-else-if="error" class="p-10 text-center">
      <p class="text-error text-lg">{{ error }}</p>
    </div>

    <EmptyState v-else-if="isOffline && !shownLibraries.length" :icon="Download" :title="t('offline.noDownloads')" />

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <router-link v-for="lib in shownLibraries" :key="lib.Id!"
        :to="{ name: 'libraryItem', params: { id: lib.Id!, name: lib.Name || '' } }"
        :aria-label="lib.Name ?? undefined"
        class="group relative rounded-xl overflow-hidden aspect-video bg-surface-raised
               active:scale-[0.97] active:opacity-75 transition-all duration-200">
        <!-- Jellyfin's generated library images already carry the name -->
        <LazyImg :src="artworkUrl(lib.Id, store.getImageUrl(lib.Id!, 'Primary', 800, 450) || '')" :alt="lib.Name ?? undefined"
          :item-type="lib.Type" class="block w-full h-full object-cover" />
        <span class="absolute top-2 left-2 size-8 rounded-full bg-black/50 backdrop-blur-sm
                     flex items-center justify-center">
          <component :is="iconFor(lib.CollectionType)" class="size-4 text-white/90" />
        </span>
      </router-link>
    </div>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { BookOpen, Download, Film, Folder, Library, Music, Tv } from 'lucide-vue-next';
import LazyImg from '@/components/LazyImg.vue';
import { AppPage, EmptyState, PageHeader } from '@/components/layout';
import OfflineBanner from '@/components/offline/OfflineBanner.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useRetryWhileFailed } from '@/composables/useRetryWhileFailed';
import { useOfflineArtwork } from '@/composables/useOfflineArtwork';
import { downloadService } from '@/services/downloadService';
import { useOfflineStore } from '@/store/offline-store';
import { librariesWithDownloads } from '@/utils/offlineLibrary';

const { t } = useI18n();
const store = useJellyfinStore();
const offlineStore = useOfflineStore();
const { artworkUrl, preload } = useOfflineArtwork();
// Libraries already fetched (or remembered from the last time online) render right away.
const libraries = ref<BaseItemDto[]>(store.libraries ?? []);
const isOffline = computed(() => !offlineStore.isFullyOnline);
const loading = ref(libraries.value.length === 0 && !isOffline.value);
const error = ref<string | null>(null);
// Offline, only the libraries holding downloads are worth opening.
const shownLibraries = computed(() =>
  isOffline.value ? librariesWithDownloads(libraries.value, offlineStore.downloads) : libraries.value);

const ICONS: Record<string, typeof Film> = {
  movies: Film,
  tvshows: Tv,
  music: Music,
  books: BookOpen,
  boxsets: Library,
};

function iconFor(collectionType?: string | null) {
  return (collectionType && ICONS[collectionType]) || Folder;
}

/** Library tiles are cached so the list still has its images offline. */
function cacheLibraryArtwork() {
  if (!store.serverUrl || !store.accessToken) return;
  for (const lib of libraries.value) {
    void downloadService.cacheArtworkById(store.serverUrl, store.accessToken, lib.Id!, 'Primary', 800);
  }
}

async function loadLibraries() {
  if (isOffline.value) {
    loading.value = false;
    return;
  }
  try {
    libraries.value = (await store.fetchLibraries()).filter((lib) => lib.Id);
    error.value = null;
    cacheLibraryArtwork();
  } catch {
    if (!libraries.value.length) error.value = t('home.loadError');
  } finally {
    loading.value = false;
  }
}

useRetryWhileFailed(computed(() => error.value !== null), loadLibraries);
watch(isOffline, (offline) => { if (!offline) loadLibraries(); });
watch(shownLibraries, (libs) => { void preload(libs.map((lib) => lib.Id!)); }, { immediate: true });
onMounted(loadLibraries);
</script>
