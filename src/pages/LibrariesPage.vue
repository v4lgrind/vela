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
      <router-link v-for="lib in shownLibraries" :key="lib.id"
        :to="{ name: 'libraryItem', params: { id: lib.id, name: lib.title } }"
        :aria-label="lib.title"
        class="group relative rounded-xl overflow-hidden aspect-video bg-surface-raised
               active:scale-[0.97] active:opacity-75 transition-all duration-200">
        <!-- Server library images usually carry the name; without one (or offline
             without a cached copy) the name is written instead. -->
        <LazyImg v-if="tileImage(lib)" :src="tileImage(lib)" :alt="lib.title"
          class="block w-full h-full object-cover" />
        <span v-else class="absolute inset-0 flex items-center justify-center px-3 text-center text-body font-semibold text-text-heading">
          {{ lib.title }}
        </span>
        <span class="absolute top-2 left-2 size-8 rounded-full bg-black/50 backdrop-blur-sm
                     flex items-center justify-center">
          <component :is="ICONS[lib.kind]" class="size-4 text-white/90" />
        </span>
      </router-link>
    </div>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download, Film, Folder, Music, Tv } from 'lucide-vue-next';
import type { Library, LibraryKind } from '@/domain';
import LazyImg from '@/components/LazyImg.vue';
import { AppPage, EmptyState, PageHeader } from '@/components/layout';
import OfflineBanner from '@/components/offline/OfflineBanner.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { useImageUrl } from '@/composables/useBackend';
import { useRetryWhileFailed } from '@/composables/useRetryWhileFailed';
import { useOfflineArtwork } from '@/composables/useOfflineArtwork';
import { useLibrariesStore } from '@/store/libraries-store';
import { useOfflineStore } from '@/store/offline-store';
import { librariesWithDownloads } from '@/utils/offlineLibrary';

const { t } = useI18n();
const librariesStore = useLibrariesStore();
const offlineStore = useOfflineStore();
const imageUrl = useImageUrl();
const { artworkUrl, preload } = useOfflineArtwork();
librariesStore.importLegacy();
// Libraries already fetched (or remembered from the last time online) render right away.
const libraries = computed(() => librariesStore.libraries);
const isOffline = computed(() => !offlineStore.isFullyOnline);
const loading = ref(libraries.value.length === 0 && !isOffline.value);
const error = ref<string | null>(null);
// Offline, only the libraries holding downloads are worth opening.
const shownLibraries = computed(() =>
  isOffline.value ? librariesWithDownloads(libraries.value, offlineStore.downloads) : libraries.value);

const ICONS: Record<LibraryKind, typeof Film> = {
  movies: Film,
  shows: Tv,
  music: Music,
  mixed: Folder,
  other: Folder,
};

function tileImage(library: Library): string {
  return artworkUrl(library.id, imageUrl(library.images.poster, { width: 400, height: 225 }));
}

async function loadLibraries() {
  if (isOffline.value) {
    loading.value = false;
    return;
  }
  try {
    await librariesStore.refresh();
    error.value = null;
    void offlineStore.cacheLibraryArtwork();
  } catch {
    if (!libraries.value.length) error.value = t('home.loadError');
  } finally {
    loading.value = false;
  }
}

useRetryWhileFailed(computed(() => error.value !== null), loadLibraries);
watch(isOffline, (offline) => { if (!offline) loadLibraries(); });
watch(shownLibraries, (libs) => { void preload(libs.map((lib) => lib.id)); }, { immediate: true });
onMounted(loadLibraries);
</script>
