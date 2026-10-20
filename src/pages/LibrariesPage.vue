<template>
  <div class="bg-background text-text-primary p-4"
    style="padding-top: calc(16px + var(--sat, env(safe-area-inset-top, 0px)))">
    <h1 class="text-2xl sm:text-3xl font-bold text-foreground mb-4">Bibliothèques</h1>

    <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <Skeleton v-for="i in 6" :key="i" class="aspect-video rounded-xl" />
    </div>

    <div v-else-if="error" class="p-10 text-center">
      <p class="text-error text-lg">{{ error }}</p>
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <router-link v-for="lib in libraries" :key="lib.Id!"
        :to="{ name: 'libraryItem', params: { id: lib.Id!, name: lib.Name || '' } }"
        :aria-label="lib.Name ?? undefined"
        class="group relative rounded-xl overflow-hidden aspect-video bg-surface-raised
               active:scale-[0.97] active:opacity-75 transition-all duration-200">
        <!-- Jellyfin's generated library images already carry the name -->
        <LazyImg :src="store.getImageUrl(lib.Id!, 'Primary', 800, 450) || ''" :alt="lib.Name ?? undefined"
          :item-type="lib.Type" class="block w-full h-full object-cover" />
        <span class="absolute top-2 left-2 size-8 rounded-full bg-black/50 backdrop-blur-sm
                     flex items-center justify-center">
          <component :is="iconFor(lib.CollectionType)" class="size-4 text-white/90" />
        </span>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { BookOpen, Film, Folder, Library, Music, Tv } from 'lucide-vue-next';
import LazyImg from '@/components/LazyImg.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { useJellyfinStore } from '@/store/jellyfin-store';

const store = useJellyfinStore();
// Libraries already fetched by the home page render right away.
const libraries = ref<BaseItemDto[]>(store.libraries ?? []);
const loading = ref(libraries.value.length === 0);
const error = ref<string | null>(null);

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

onMounted(async () => {
  try {
    libraries.value = (await store.fetchLibraries()).filter((lib) => lib.Id);
  } catch {
    if (!libraries.value.length) error.value = 'Failed to load media libraries';
  } finally {
    loading.value = false;
  }
});
</script>
