<template>
  <div class="bg-background text-text-primary p-4"
    style="padding-top: calc(16px + var(--sat, env(safe-area-inset-top, 0px)))">

    <header class="flex items-center justify-between mb-4">
      <h1 class="text-2xl sm:text-3xl font-bold text-foreground">Accueil</h1>
      <button
        type="button"
        title="Actualiser l’accueil"
        aria-label="Actualiser l’accueil"
        :disabled="refreshing"
        class="size-10 rounded-full border border-border-default bg-surface-raised text-text-muted
               flex items-center justify-center active:scale-95 transition disabled:opacity-50"
        @click="loadMedia(true)">
        <RefreshCw class="size-4" :class="{ 'animate-spin': refreshing }" />
      </button>
    </header>

    <!-- Continue Watching -->
    <section v-if="resumeItems.length" class="mb-5">
      <h2 class="text-xl sm:text-2xl font-bold text-foreground mb-4">Continue Watching</h2>
      <div class="flex gap-3 overflow-x-auto pt-2 pb-1 scrollbar-hide">
        <div v-for="item in resumeItems" :key="item.Id" class="shrink-0 w-44 sm:w-52 group">
          <!-- Thumbnail -->
          <div class="relative rounded-xl overflow-hidden aspect-video mb-1.5
                      group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200 cursor-pointer active:scale-[0.97] active:opacity-75"
               @click="playResume(item)">
            <LazyImg :src="getResumeImageUrl(item)" :alt="item.Name ?? undefined" :item-type="item.Type"
              class="block w-full h-full object-cover" />

            <!-- Play overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-200
                        flex items-center justify-center pointer-events-none">
              <div class="bg-white/90 rounded-full p-2.5 shadow-lg">
                <Play class="size-4 fill-black stroke-none" />
              </div>
            </div>

            <!-- Download badge -->
            <div v-if="offlineStore.isItemDownloaded(item.Id)"
              class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none">
              <DownloadIcon class="size-3 text-white" />
            </div>
            <div v-else-if="downloadStore.isDownloading(item.Id)"
              class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none animate-pulse">
              <Loader2 class="size-3 text-white animate-spin" />
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
            <LazyImg :src="getResumeImageUrl(item)" :alt="item.Name ?? undefined" :item-type="item.Type"
              class="block w-full h-full object-cover" />

            <!-- Play overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent
                        opacity-0 group-hover:opacity-100 transition-opacity duration-200
                        flex items-center justify-center pointer-events-none">
              <div class="bg-white/90 rounded-full p-2.5 shadow-lg">
                <Play class="size-4 fill-black stroke-none" />
              </div>
            </div>

            <!-- Download badge -->
            <div v-if="offlineStore.isItemDownloaded(item.Id)"
              class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none">
              <DownloadIcon class="size-3 text-white" />
            </div>
            <div v-else-if="downloadStore.isDownloading(item.Id)"
              class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none animate-pulse">
              <Loader2 class="size-3 text-white animate-spin" />
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
                 :title="item.SeriesName ?? item.Name ?? undefined">
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
            <div class="relative rounded-xl overflow-hidden mb-1.5 aspect-[2/3]
                        group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200">
              <LazyImg :src="getLatestImageUrl(item)" :alt="item.Name ?? undefined" :item-type="item.Type"
                class="block w-full h-full object-cover" />
              <!-- Download badge -->
              <div v-if="offlineStore.isItemDownloaded(item.Id)"
                class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none">
                <DownloadIcon class="size-3 text-white" />
              </div>
              <div v-else-if="downloadStore.isDownloading(item.Id)"
                class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none animate-pulse">
                <Loader2 class="size-3 text-white animate-spin" />
              </div>
            </div>
            <div class="px-0.5 text-xs font-semibold text-text-heading truncate
                        group-hover:text-accent-purple-light transition-colors"
              :title="item.Name ?? undefined">
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
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { useJellyfinStore } from '@/store/jellyfin-store';
import type { HomeCache, HomeItem, HomeLibraryCard } from '@/store/jellyfin-store';
import LazyImg from '@/components/LazyImg.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Check, Download as DownloadIcon, Loader2, Play, RefreshCw } from 'lucide-vue-next';
import { useOfflineStore } from '@/store/offline-store';
import { useDownloadStore } from '@/store/download-store';

const store = useJellyfinStore();
const offlineStore = useOfflineStore();
const downloadStore = useDownloadStore();
const router = useRouter();

const mediaItems = ref<HomeLibraryCard[]>([]);
const resumeItems = ref<HomeItem[]>([]);
const nextUpItems = ref<HomeItem[]>([]);
const latestByLibrary = ref<Record<string, HomeItem[]>>({});
const loading = ref(true);
const latestLoading = ref(false);
const refreshing = ref(false);
const error = ref<string | null>(null);

function hasHomeItemId(item: BaseItemDto): item is HomeItem {
  return typeof item.Id === 'string' && item.Id.length > 0;
}

function restoreCachedHome(): boolean {
  const cache = store.homeCache;
  const key = JSON.stringify([store.serverUrl, store.userId]);
  if (!cache || cache.key !== key) return false;
  mediaItems.value = cache.mediaItems;
  resumeItems.value = cache.resumeItems;
  nextUpItems.value = cache.nextUpItems;
  latestByLibrary.value = cache.latestByLibrary;
  loading.value = false;
  latestLoading.value = false;
  return true;
}

function cacheCurrentHome() {
  const snapshot: HomeCache = {
    key: JSON.stringify([store.serverUrl, store.userId]),
    mediaItems: mediaItems.value,
    resumeItems: resumeItems.value,
    nextUpItems: nextUpItems.value,
    latestByLibrary: latestByLibrary.value,
  };
  store.homeCache = snapshot;
}

async function loadMedia(force = false) {
  // A stale snapshot stays rendered while fresh data loads without a spinner.
  if (!force && restoreCachedHome() && !store.homeCache?.stale) return;

  const hasCachedContent = mediaItems.value.length > 0;
  loading.value = !hasCachedContent;
  refreshing.value = force;
  error.value = null;
  try {
    const [libs, resume, nextUp] = await Promise.all([
      store.fetchLibraries(),
      store.fetchResumeItems(12),
      store.fetchAllNextUp(20),
    ]);
    const validLibraries = libs.filter(hasHomeItemId);
    mediaItems.value = validLibraries.map(lib => ({
      Id: lib.Id,
      Name: lib.Name || '',
      Type: lib.Type,
      imageUrl: store.getImageUrl(lib.Id, 'Primary', 800, 400) || '',
    }));
    resumeItems.value = resume.filter(hasHomeItemId);
    const resumeIds = new Set(resumeItems.value.map(item => item.Id));
    nextUpItems.value = nextUp
      .filter(hasHomeItemId)
      .filter(item => !resumeIds.has(item.Id));
    loading.value = false;

    latestLoading.value = Object.keys(latestByLibrary.value).length === 0;
    const latestResults = await Promise.all(
      validLibraries.map(lib => store.fetchLatestItems(lib.Id, 10)),
    );
    const latestMap: Record<string, HomeItem[]> = {};
    validLibraries.forEach((lib, index) => {
      latestMap[lib.Id] = latestResults[index].filter(hasHomeItemId);
    });
    latestByLibrary.value = latestMap;
    cacheCurrentHome();
  } catch {
    if (!hasCachedContent) error.value = 'Failed to load media libraries';
  } finally {
    loading.value = false;
    latestLoading.value = false;
    refreshing.value = false;
  }
}

function getLatestImageUrl(item: HomeItem): string {
  if (item.Type === 'Episode') {
    const posterId = item.SeriesId || item.ParentPrimaryImageItemId;
    return posterId ? store.getImageUrl(posterId, 'Primary', 300, 450) : '';
  }
  return store.getImageUrl(item.Id, 'Primary', 300, 450) || '';
}

function getResumeImageUrl(item: HomeItem): string {
  if (item.BackdropImageTags?.length) {
    return store.getImageUrl(item.Id, 'Backdrop', 640, 360);
  }
  if (item.ParentBackdropItemId) {
    return store.getImageUrl(item.ParentBackdropItemId, 'Backdrop', 640, 360);
  }
  return store.getImageUrl(item.Id, 'Primary', 640, 360) || '';
}

function resumeTitle(item: HomeItem): string {
  return (item.Type === 'Episode' ? item.SeriesName || item.Name : item.Name) || '';
}

function remainingTime(item: HomeItem): string {
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

async function markPlayed(item: HomeItem) {
  if (markingPlayed.value.has(item.Id)) return;
  markingPlayed.value.add(item.Id);
  try {
    await store.markPlayed(item.Id);
    resumeItems.value = resumeItems.value.filter(candidate => candidate.Id !== item.Id);
    nextUpItems.value = nextUpItems.value.filter(candidate => candidate.Id !== item.Id);
    cacheCurrentHome();
  } finally {
    markingPlayed.value.delete(item.Id);
  }
}

function playResume(item: HomeItem) {
  const ticks = item.UserData?.PlaybackPositionTicks;
  router.push({
    name: 'Player',
    params: { id: item.Id },
    query: ticks ? { startTicks: String(ticks) } : {},
  });
}

function goToItem(item: HomeItem) {
  router.push({ name: 'ItemDetails', params: { id: item.Id } });
}

onMounted(() => {
  loadMedia();
});
</script>
