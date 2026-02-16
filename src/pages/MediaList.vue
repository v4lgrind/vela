<template>
  <div class="min-h-dvh bg-surface text-text-primary p-5">
    <header class="flex justify-between items-center mb-5">
      <h2 class="text-3xl font-semibold">My Library</h2>
    </header>

    <!-- Loading state -->
    <div v-if="loading" class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-4 xl:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] xl:gap-5">
      <Skeleton v-for="i in 6" :key="i" class="h-48 rounded-xl" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="p-10 text-center">
      <p class="text-error text-lg">{{ error }}</p>
    </div>

    <!-- Library grid -->
    <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-4 xl:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] xl:gap-5 list-none p-0 m-0">
      <li v-for="item in mediaItems" :key="item.Id">
        <Card class="bg-surface-raised border-border-default hover:-translate-y-1 hover:bg-surface-hover hover:border-border-hover hover:shadow-xl transition-all duration-200 flex flex-col items-center p-2.5 pb-3 overflow-hidden">
          <router-link class="text-accent-purple-light text-center font-semibold no-underline hover:text-accent-purple hover:underline mt-2 max-w-full break-words" :to="{ name: 'libraryItem', params: { id: item.Id, name: item.Name } }">
            <LazyImg :src="item.imageUrl" alt="poster" :item-type="item.Type" class="block w-full h-full object-cover rounded-[10px]" />
            <div class="mt-2">{{ item.Name }}</div>
          </router-link>
        </Card>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useJellyfinStore } from '@/store/jellyfin-store';
import LazyImg from '@/components/LazyImg.vue';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const store = useJellyfinStore();

const mediaItems = ref<Array<{ Id: string; Name: string; imageUrl: string; Type?: string }>>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function loadMedia() {
  loading.value = true;
  error.value = null;
  try {
    const libs = await store.fetchLibraries();
    mediaItems.value = libs.map(lib => ({
      Id: lib.Id!,
      Name: lib.Name!,
      Type: lib.Type,
      imageUrl: store.getImageUrl(lib.Id!, 'Primary', 300, 150) || ''
    }));
  } catch (e) {
    error.value = 'Failed to load media libraries';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadMedia();
});
</script>
