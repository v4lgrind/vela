<template>
  <div class="min-h-dvh bg-surface text-text-primary p-4 sm:p-6 md:p-8">
    <header class="mb-6 sm:mb-8">
      <h2 class="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">My Library</h2>
    </header>

    <!-- Loading state -->
    <div v-if="loading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      <Skeleton v-for="i in 6" :key="i" class="aspect-[2/1] rounded-2xl" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="p-10 text-center">
      <p class="text-error text-lg">{{ error }}</p>
    </div>

    <!-- Library grid -->
    <ul v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-5 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 list-none p-0 m-0">
      <li v-for="item in mediaItems" :key="item.Id">
        <Card class="bg-surface-raised border-border-default hover:-translate-y-1 hover:bg-surface-hover hover:border-border-hover hover:shadow-xl transition-all duration-200 overflow-hidden p-0 rounded-2xl aspect-[2/1]">
          <router-link class="block w-full h-full" :to="{ name: 'libraryItem', params: { id: item.Id, name: item.Name } }">
            <LazyImg :src="item.imageUrl" :alt="item.Name" :item-type="item.Type" class="block w-full h-full object-cover" />
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
      imageUrl: store.getImageUrl(lib.Id!, 'Primary', 800, 400) || ''
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
