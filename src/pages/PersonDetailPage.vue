<template>
  <AppPage class="min-h-dvh bg-background pb-8 text-text-body">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <Loader2 class="size-8 text-accent-purple animate-spin" />
    </div>

    <template v-else>
      <PageHeader back :title="person?.Name ?? ''"
        :subtitle="filmography.length ? t('person.titles', filmography.length) : undefined" />
      <!-- Hero -->
      <div class="pt-3 pb-2 flex gap-5 items-start">
        <div class="shrink-0 w-28 aspect-[2/3] rounded-2xl overflow-hidden bg-surface-raised shadow-lg">
          <LazyImg
            :src="person?.Id ? store.getImageUrl(person.Id, 'Primary', 300) : ''"
            :alt="person?.Name ?? ''"
            item-type="person"
            class="w-full h-full object-cover object-top"
          />
        </div>
        <div class="flex-1 min-w-0 pt-1">
          <p v-if="person?.Overview" class="text-body text-text-body line-clamp-6 leading-relaxed">
            {{ person.Overview }}
          </p>
        </div>
      </div>

      <!-- Filmography -->
      <Section v-if="filmography.length" :title="t('person.filmography')" class="mt-section">
        <div class="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(130px,1fr))] sm:gap-4">
          <div
            v-for="item in filmography"
            :key="item.Id"
            class="cursor-pointer group"
            @click="router.push({ name: 'ItemDetails', params: { id: item.Id } })"
          >
            <div class="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-raised shadow mb-1.5 group-hover:-translate-y-0.5 transition-transform duration-200">
              <LazyImg
                :src="store.getImageUrl(item.Id, 'Primary', 300)"
                :alt="item.Name ?? ''"
                :item-type="item.Type?.toLowerCase() ?? 'movie'"
                class="w-full h-full object-cover"
              />
              <div v-if="offlineStore.isItemDownloaded(item.Id)"
                class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none">
                <DownloadIcon class="size-3 text-white" />
              </div>
              <div v-else-if="downloadStore.isDownloading(item.Id)"
                class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none animate-pulse">
                <Loader2 class="size-3 text-white animate-spin" />
              </div>
            </div>
            <p class="text-xs font-medium text-text-primary truncate">{{ item.Name }}</p>
            <p v-if="item.ProductionYear" class="text-xs text-text-subtle">{{ item.ProductionYear }}</p>
          </div>
        </div>
      </Section>

      <div v-if="!filmography.length && !loading" class="flex flex-col items-center justify-center py-16 text-text-muted">
        <p class="text-body">{{ t('person.empty') }}</p>
      </div>
    </template>
  </AppPage>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { AppPage, PageHeader, Section } from '@/components/layout';
import { useJellyfinStore } from '@/store/jellyfin-store';
import LazyImg from '@/components/LazyImg.vue';
import { Download as DownloadIcon, Loader2 } from 'lucide-vue-next';
import { useOfflineStore } from '@/store/offline-store';
import { useDownloadStore } from '@/store/download-store';

const props = defineProps<{ id: string }>();

const { t } = useI18n();
const router = useRouter();
const store = useJellyfinStore();
const offlineStore = useOfflineStore();
const downloadStore = useDownloadStore();

const loading = ref(true);
const person = ref<any>(null);
const filmography = ref<any[]>([]);

onMounted(async () => {
  try {
    const [personData, items] = await Promise.all([
      store.fetchPersonDetails(props.id),
      store.fetchPersonFilmography(props.id),
    ]);
    person.value = personData;
    filmography.value = items;
  } finally {
    loading.value = false;
  }
});
</script>
