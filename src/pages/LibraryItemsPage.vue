<template>
  <div class="min-h-dvh bg-surface text-text-primary p-5 flex flex-col">
    <section class="flex-1">
      <ul class="list-none p-0 m-0 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-4">
        <li v-for="item in items" :key="item.Id">
          <Card class="bg-surface-raised border-border-default hover:-translate-y-1 hover:bg-surface-hover hover:border-border-hover hover:shadow-xl transition-all duration-200 flex flex-col items-center p-2.5 pb-3 overflow-hidden">
            <router-link v-if="item.Type === 'BoxSet'"
              :to="{ name: 'libraryItem', params: { id: item.Id, name: item.Name } }"
              class="w-full rounded-[10px] overflow-hidden bg-black/60 shadow-lg"
              :class="isAudioType(item.Type) ? 'aspect-square' : 'aspect-[2/3]'">
              <LazyImg :src="getImageUrl(item.Id, item.Type)" :alt="item.Name" :item-type="item.Type"
                class="w-full h-full object-cover block" @click="loadPage()" />
            </router-link>

            <router-link v-else :to="{ name: 'ItemDetails', params: { id: item.Id } }"
              class="w-full rounded-[10px] overflow-hidden bg-black/60 shadow-lg"
              :class="isAudioType(item.Type) ? 'aspect-square' : 'aspect-[2/3]'">
              <LazyImg :src="getImageUrl(item.Id, item.Type)" :alt="item.Name" :item-type="item.Type"
                class="w-full h-full object-cover block" />
            </router-link>

            <div class="w-full text-center mt-2.5">
              <div class="text-[0.95rem] font-semibold text-text-heading truncate" :title="item.Name">{{ item.Name }}</div>
              <Badge variant="secondary" class="mt-1 text-xs">{{ item.Type }}</Badge>
            </div>
          </Card>
        </li>
      </ul>

      <!-- Pagination -->
      <div class="flex items-center justify-center gap-3 mt-5">
        <Button variant="outline" :disabled="startIndex === 0" @click="prevPage">
          <ArrowLeft class="size-4 mr-1" /> Previous
        </Button>
        <span class="text-text-primary font-semibold">Page {{ currentPage }}</span>
        <Button variant="outline" :disabled="!hasNextPage" @click="nextPage">
          Next <ArrowRight class="size-4 ml-1" />
        </Button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import LazyImg from '@/components/LazyImg.vue';
import { isAudioType } from '@/utils/helpers';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-vue-next';

const store = useJellyfinStore();
const route = useRoute();
const libraryId = route.params.id as string;

const items = ref<any[]>([]);
const limit = ref(50);
const startIndex = ref(0);
const hasNextPage = ref(false);
const loading = ref(true);
const error = ref<string | null>(null);

const currentPage = computed(() => Math.floor(startIndex.value / limit.value) + 1);

function getImageUrl(id: string, itemType?: string) {
  const isAudio = itemType && isAudioType(itemType);
  return store.getImageUrl(id, 'Primary', isAudio ? 150 : 130, isAudio ? 150 : 195) || '';
}

async function loadPage() {
  loading.value = true;
  error.value = null;
  try {
    const pageItems = await store.fetchItems(libraryId, {
      startIndex: startIndex.value,
      limit: limit.value,
    });
    items.value = pageItems;
    hasNextPage.value = pageItems.length === limit.value;
  } catch (e) {
    error.value = 'Failed to load items';
  } finally {
    loading.value = false;
  }
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

onMounted(loadPage);

watch(() => route.params.id, async (newId) => {
  if (!newId) return;
  startIndex.value = 0;
  await loadPage();
});
</script>
