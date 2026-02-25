<template>
  <div class="bg-surface text-text-primary p-4">

    <!-- Continue Watching -->
    <section v-if="resumeItems.length" class="mb-5">
      <h2 class="text-xl sm:text-2xl font-bold text-foreground mb-4">Continue Watching</h2>
      <div class="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        <div v-for="item in resumeItems" :key="item.Id" class="shrink-0 w-44 sm:w-52 group">
          <!-- Thumbnail -->
          <div class="relative rounded-xl overflow-hidden aspect-video mb-1.5
                      group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200 cursor-pointer"
               @click="playResume(item)">
            <LazyImg :src="getResumeImageUrl(item)" :alt="item.Name" :item-type="item.Type"
              class="block w-full h-full object-cover" />

            <!-- Play overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-200
                        flex items-center justify-center pointer-events-none">
              <div class="bg-white/90 rounded-full p-2.5 shadow-lg">
                <Play class="size-4 fill-black stroke-none" />
              </div>
            </div>

            <!-- Progress bar — after overlay in DOM so it always renders on top -->
            <div class="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div class="h-full bg-accent-purple transition-all"
                :style="{ width: (item.UserData?.PlayedPercentage ?? 0) + '%' }" />
            </div>
          </div>

          <!-- Title -->
          <div class="px-0.5 cursor-pointer" @click="goToItem(item)">
            <div class="text-xs font-semibold text-text-heading truncate hover:text-accent-purple-light transition-colors"
                 :title="resumeTitle(item)">
              {{ resumeTitle(item) }}
            </div>
            <div v-if="item.Type === 'Episode'" class="text-xs text-text-muted truncate mt-0.5">
              S{{ item.ParentIndexNumber }}E{{ item.IndexNumber }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Next Up -->
    <section v-if="nextUpItems.length" class="mb-5">
      <h2 class="text-xl sm:text-2xl font-bold text-foreground mb-4">Next Up</h2>
      <div class="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        <div v-for="item in nextUpItems" :key="item.Id" class="shrink-0 w-44 sm:w-52 group">
          <!-- Thumbnail -->
          <div class="relative rounded-xl overflow-hidden aspect-video mb-1.5
                      group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200 cursor-pointer"
               @click="playResume(item)">
            <LazyImg :src="getResumeImageUrl(item)" :alt="item.Name" :item-type="item.Type"
              class="block w-full h-full object-cover" />

            <!-- Play overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-200
                        flex items-center justify-center pointer-events-none">
              <div class="bg-white/90 rounded-full p-2.5 shadow-lg">
                <Play class="size-4 fill-black stroke-none" />
              </div>
            </div>
          </div>

          <!-- Title -->
          <div class="px-0.5 cursor-pointer" @click="goToItem(item)">
            <div class="text-xs font-semibold text-text-heading truncate hover:text-accent-purple-light transition-colors"
                 :title="item.SeriesName ?? item.Name">
              {{ item.SeriesName ?? item.Name }}
            </div>
            <div class="text-xs text-text-muted truncate mt-0.5">
              S{{ item.ParentIndexNumber }}E{{ item.IndexNumber }} · {{ item.Name }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Libraries -->
    <section>
      <h2 class="text-xl sm:text-2xl font-bold text-foreground mb-4">My Library</h2>

      <!-- Loading state -->
      <div v-if="loading" class="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        <Skeleton v-for="i in 6" :key="i" class="shrink-0 w-44 sm:w-52 aspect-video rounded-xl" />
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="p-10 text-center">
        <p class="text-error text-lg">{{ error }}</p>
      </div>

      <!-- Library row -->
      <div v-else class="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        <router-link v-for="item in mediaItems" :key="item.Id"
          class="shrink-0 w-44 sm:w-52 group"
          :to="{ name: 'libraryItem', params: { id: item.Id, name: item.Name } }">
          <div class="relative rounded-xl overflow-hidden aspect-video mb-1.5
                      group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200">
            <LazyImg :src="item.imageUrl" :alt="item.Name" :item-type="item.Type"
              class="block w-full h-full object-cover" />
          </div>
          <div class="px-0.5 text-xs font-semibold text-text-heading truncate
                      group-hover:text-accent-purple-light transition-colors">
            {{ item.Name }}
          </div>
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useJellyfinStore } from '@/store/jellyfin-store';
import LazyImg from '@/components/LazyImg.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { Play } from 'lucide-vue-next';

const store = useJellyfinStore();
const router = useRouter();

const mediaItems = ref<Array<{ Id: string; Name: string; imageUrl: string; Type?: string }>>([]);
const resumeItems = ref<any[]>([]);
const nextUpItems = ref<any[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

async function loadMedia() {
  loading.value = true;
  error.value = null;
  try {
    const [libs, resume, nextUp] = await Promise.all([
      store.fetchLibraries(),
      store.fetchResumeItems(12),
      store.fetchAllNextUp(20),
    ]);
    mediaItems.value = libs.map(lib => ({
      Id: lib.Id!,
      Name: lib.Name!,
      Type: lib.Type,
      imageUrl: store.getImageUrl(lib.Id!, 'Primary', 800, 400) || ''
    }));
    resumeItems.value = resume;
    nextUpItems.value = nextUp;
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

function goToItem(item: any) {
  router.push({ name: 'ItemDetails', params: { id: item.Id } });
}

onMounted(() => {
  loadMedia();
});
</script>
