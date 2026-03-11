<template>
  <div class="bg-surface text-text-primary p-4">

    <!-- Continue Watching -->
    <section v-if="resumeItems.length" class="mb-5">
      <h2 class="text-xl sm:text-2xl font-bold text-foreground mb-4">Continue Watching</h2>
      <div class="flex gap-3 overflow-x-auto pt-2 pb-1 scrollbar-hide">
        <div v-for="item in resumeItems" :key="item.Id" class="shrink-0 w-44 sm:w-52 group">
          <!-- Thumbnail -->
          <div class="relative rounded-xl overflow-hidden aspect-video mb-1.5
                      group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200 cursor-pointer active:scale-[0.97] active:opacity-75"
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

            <!-- Mark as played button -->
            <button @click.stop="markPlayed(item)" title="Mark as played"
              class="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white/70
                     opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/80 hover:text-white
                     transition-all duration-200 cursor-pointer pointer-events-auto">
              <Loader2 v-if="markingPlayed.has(item.Id)" class="size-3 animate-spin" />
              <Check v-else class="size-3" />
            </button>

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
            <div v-if="remainingTime(item)" class="text-xs text-text-muted mt-0.5">
              {{ remainingTime(item) }} left
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Next Up -->
    <section v-if="nextUpItems.length" class="mb-5">
      <h2 class="text-xl sm:text-2xl font-bold text-foreground mb-4">Next Up</h2>
      <div class="flex gap-3 overflow-x-auto pt-2 pb-1 scrollbar-hide">
        <div v-for="item in nextUpItems" :key="item.Id" class="shrink-0 w-44 sm:w-52 group">
          <!-- Thumbnail -->
          <div class="relative rounded-xl overflow-hidden aspect-video mb-1.5
                      group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200 cursor-pointer active:scale-[0.97] active:opacity-75"
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

            <!-- Mark as played button -->
            <button @click.stop="markPlayed(item)" title="Mark as played"
              class="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white/70
                     opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/80 hover:text-white
                     transition-all duration-200 cursor-pointer pointer-events-auto">
              <Loader2 v-if="markingPlayed.has(item.Id)" class="size-3 animate-spin" />
              <Check v-else class="size-3" />
            </button>
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

    <!-- Recently Added per library -->
    <template v-if="latestLoading">
      <section v-for="lib in mediaItems" :key="'latest-skeleton-' + lib.Id" class="mb-5">
        <Skeleton class="h-6 w-56 mb-4 rounded-md" />
        <div class="flex gap-3 overflow-x-auto pt-2 pb-1 scrollbar-hide">
          <Skeleton v-for="i in 5" :key="i" class="shrink-0 w-32 sm:w-36 aspect-[2/3] rounded-xl" />
        </div>
      </section>
    </template>
    <template v-else>
      <section v-for="lib in mediaItems" :key="'latest-' + lib.Id"
        class="mb-5"
        v-show="latestByLibrary[lib.Id]?.length">
        <h2 class="text-xl sm:text-2xl font-bold text-foreground mb-4">
          Recently Added · {{ lib.Name }}
        </h2>
        <div class="flex gap-3 overflow-x-auto pt-2 pb-1 scrollbar-hide">
          <div v-for="item in latestByLibrary[lib.Id]" :key="item.Id"
            class="shrink-0 w-32 sm:w-36 group cursor-pointer active:scale-[0.97] active:opacity-75 transition-all duration-200"
            @click="goToItem(item)">
            <div class="relative rounded-xl overflow-hidden mb-1.5
                        group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200"
              :class="item.Type === 'Episode' ? 'aspect-video' : 'aspect-[2/3]'">
              <LazyImg :src="getLatestImageUrl(item)" :alt="item.Name" :item-type="item.Type"
                class="block w-full h-full object-cover" />
            </div>
            <div class="px-0.5 text-xs font-semibold text-text-heading truncate
                        group-hover:text-accent-purple-light transition-colors"
              :title="item.Name">
              {{ item.Name }}
            </div>
            <div v-if="item.ProductionYear" class="px-0.5 text-xs text-text-muted mt-0.5">
              {{ item.ProductionYear }}
            </div>
          </div>

          <!-- View all button -->
          <router-link
            :to="{ name: 'libraryItem', params: { id: lib.Id, name: lib.Name } }"
            class="shrink-0 w-32 sm:w-36 flex flex-col items-center justify-center gap-2
                   aspect-[2/3] rounded-xl border border-white/10 bg-white/5
                   hover:bg-white/10 hover:border-white/20 transition-colors group">
            <ArrowRight class="size-6 text-text-muted group-hover:text-accent-purple-light transition-colors" />
            <span class="text-xs font-medium text-text-muted group-hover:text-accent-purple-light transition-colors">
              View all
            </span>
          </router-link>
        </div>
      </section>
    </template>

    <!-- Libraries -->
    <section>
      <h2 class="text-xl sm:text-2xl font-bold text-foreground mb-4">My Library</h2>

      <!-- Loading state -->
      <div v-if="loading" class="flex gap-3 overflow-x-auto pt-2 pb-1 scrollbar-hide">
        <Skeleton v-for="i in 6" :key="i" class="shrink-0 w-44 sm:w-52 aspect-video rounded-xl" />
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="p-10 text-center">
        <p class="text-error text-lg">{{ error }}</p>
      </div>

      <!-- Library row -->
      <div v-else class="flex gap-3 overflow-x-auto pt-2 pb-1 scrollbar-hide">
        <router-link v-for="item in mediaItems" :key="item.Id"
          class="shrink-0 w-44 sm:w-52 group active:scale-[0.97] active:opacity-75 transition-all duration-200"
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
import { ArrowRight, Check, Loader2, Play } from 'lucide-vue-next';

const store = useJellyfinStore();
const router = useRouter();

const mediaItems = ref<Array<{ Id: string; Name: string; imageUrl: string; Type?: string }>>([]);
const resumeItems = ref<any[]>([]);
const nextUpItems = ref<any[]>([]);
const latestByLibrary = ref<Record<string, any[]>>({});
const loading = ref(true);
const latestLoading = ref(false);
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
    loading.value = false;

    // Fetch latest items per library in parallel after main content is shown
    latestLoading.value = true;
    const latestResults = await Promise.all(libs.map(lib => store.fetchLatestItems(lib.Id!, 10)));
    const map: Record<string, any[]> = {};
    libs.forEach((lib, i) => { map[lib.Id!] = latestResults[i]; });
    latestByLibrary.value = map;
  } catch (e) {
    error.value = 'Failed to load media libraries';
  } finally {
    loading.value = false;
    latestLoading.value = false;
  }
}

function getLatestImageUrl(item: any): string {
  if (item.Type === 'Episode') {
    if (item.BackdropImageTags?.length) return store.getImageUrl(item.Id, 'Backdrop', 640, 360);
    if (item.ParentBackdropItemId) return store.getImageUrl(item.ParentBackdropItemId, 'Backdrop', 640, 360);
  }
  return store.getImageUrl(item.Id, 'Primary', 300, 450) || '';
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

function remainingTime(item: any): string {
  const total = item.RunTimeTicks;
  const position = item.UserData?.PlaybackPositionTicks ?? 0;
  if (!total || !position) return '';
  const remainingSecs = Math.max(0, Math.floor((total - position) / 10_000_000));
  if (remainingSecs < 60) return '';
  const h = Math.floor(remainingSecs / 3600);
  const m = Math.floor((remainingSecs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const markingPlayed = ref<Set<string>>(new Set());

async function markPlayed(item: any) {
  if (markingPlayed.value.has(item.Id)) return;
  markingPlayed.value.add(item.Id);
  try {
    await store.markPlayed(item.Id);
    resumeItems.value = resumeItems.value.filter(i => i.Id !== item.Id);
    nextUpItems.value = nextUpItems.value.filter(i => i.Id !== item.Id);
  } finally {
    markingPlayed.value.delete(item.Id);
  }
}

function playResume(item: any) {
  const ticks = item.UserData?.PlaybackPositionTicks;
  router.push({
    name: 'Player',
    params: { id: item.Id },
    query: ticks ? { startTicks: String(ticks) } : {},
  });
}

function goToItem(item: any) {
  router.push({ name: 'ItemDetails', params: { id: item.Id } });
}

onMounted(() => {
  loadMedia();
});
</script>
