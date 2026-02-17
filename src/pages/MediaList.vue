<template>
  <div class="min-h-dvh bg-surface text-text-primary p-4 sm:p-6 md:p-8">

    <!-- Continue Watching -->
    <section v-if="resumeItems.length" class="mb-8 sm:mb-10">
      <h2 class="text-xl sm:text-2xl font-bold text-foreground mb-4">Continue Watching</h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        <div v-for="item in resumeItems" :key="item.Id" class="relative group cursor-pointer" @click="playResume(item)">
          <Card class="bg-surface-raised border-border-default overflow-hidden p-0 rounded-xl aspect-video group-hover:-translate-y-1 group-hover:shadow-xl group-hover:border-border-hover transition-all duration-200">
            <LazyImg
              :src="getResumeImageUrl(item)"
              :alt="item.Name"
              :item-type="item.Type"
              class="block w-full h-full object-cover" />

            <!-- Progress bar -->
            <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
              <div class="h-full bg-accent-purple transition-all"
                :style="{ width: (item.UserData?.PlayedPercentage ?? 0) + '%' }" />
            </div>

            <!-- Play overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
              <div class="bg-white/90 rounded-full p-3 shadow-lg">
                <Play class="size-5 fill-black stroke-none" />
              </div>
            </div>
          </Card>

          <!-- Title below card -->
          <div class="mt-1.5 px-0.5">
            <div class="text-xs font-semibold text-text-heading truncate" :title="resumeTitle(item)">
              {{ resumeTitle(item) }}
            </div>
            <div v-if="item.Type === 'Episode'" class="text-[11px] text-text-muted truncate mt-0.5">
              S{{ item.ParentIndexNumber }}E{{ item.IndexNumber }} · {{ item.SeriesName }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Libraries -->
    <header class="mb-4 sm:mb-6">
      <h2 class="text-xl sm:text-2xl font-bold text-foreground">My Library</h2>
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
import { useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import LazyImg from '@/components/LazyImg.vue';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Play } from 'lucide-vue-next';

const store = useJellyfinStore();
const router = useRouter();

const mediaItems = ref<Array<{ Id: string; Name: string; imageUrl: string; Type?: string }>>([]);
const resumeItems = ref<any[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function loadMedia() {
  loading.value = true;
  error.value = null;
  try {
    const [libs, resume] = await Promise.all([
      store.fetchLibraries(),
      store.fetchResumeItems(12),
    ]);
    mediaItems.value = libs.map(lib => ({
      Id: lib.Id!,
      Name: lib.Name!,
      Type: lib.Type,
      imageUrl: store.getImageUrl(lib.Id!, 'Primary', 800, 400) || ''
    }));
    resumeItems.value = resume;
  } catch (e) {
    error.value = 'Failed to load media libraries';
  } finally {
    loading.value = false;
  }
}

function getResumeImageUrl(item: any): string {
  // Prefer Backdrop for episodes/movies (landscape fits the aspect-video card)
  if (item.BackdropImageTags?.length) {
    return store.getImageUrl(item.Id, 'Backdrop', 640, 360);
  }
  if (item.ParentBackdropItemId) {
    return store.getImageUrl(item.ParentBackdropItemId, 'Backdrop', 640, 360);
  }
  return store.getImageUrl(item.Id, 'Primary', 640, 360) || '';
}

function resumeTitle(item: any): string {
  return item.Type === 'Episode' ? (item.SeriesName ?? item.Name) : item.Name;
}

function playResume(item: any) {
  router.push({ name: 'Player', params: { id: item.Id } });
}

onMounted(() => {
  loadMedia();
});
</script>
