<template>
  <AppPage class="bg-background pb-6 text-text-primary">
    <PageHeader :title="t('home.title')" class="mb-4">
      <template #actions>
        <!-- Pick the music output before playing anything -->
        <Button
          v-if="audioStore.airplaySupported && !audioStore.castDevice"
          variant="ghost" size="icon" class="rounded-full"
          :title="audioStore.airplayDevice ?? 'AirPlay'"
          aria-label="AirPlay"
          :class="audioStore.airplayDevice ? 'text-accent-purple' : 'text-text-muted'"
          @click="showAirPlay = true">
          <Airplay class="size-5" />
        </Button>
        <Button
          v-if="(audioStore.castAvailable || audioStore.castDevice) && !audioStore.airplayDevice"
          variant="ghost" size="icon" class="rounded-full"
          :title="audioStore.castDevice ?? 'Cast'"
          aria-label="Cast"
          :class="audioStore.castDevice ? 'text-accent-purple' : 'text-text-muted'"
          @click="audioPlayerService.openCastDialog()">
          <Cast class="size-5" />
        </Button>
        <Button
          variant="ghost" size="icon" class="rounded-full text-text-muted"
          :title="t('home.refresh')"
          :aria-label="t('home.refresh')"
          :disabled="refreshing"
          @click="loadMedia(true)">
          <RefreshCw class="size-5" :class="{ 'animate-spin': refreshing }" />
        </Button>
      </template>
    </PageHeader>
    <AirPlayDialog v-model:open="showAirPlay" />

    <!-- Offline: what is on the device -->
    <OfflineHome v-if="isOffline" />

    <template v-else>
    <!-- Continue Watching -->
    <Section v-if="resumeItems.length" :title="t('home.continueWatching')">
      <MediaRail>
        <div v-for="item in resumeItems" :key="item.id" class="shrink-0 w-44 sm:w-52 group">
          <!-- Thumbnail -->
          <div class="relative rounded-xl overflow-hidden bg-surface-raised aspect-video mb-1.5
                      group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200 cursor-pointer active:scale-[0.97] active:opacity-75"
               @click="playResume(item)">
            <LazyImg :src="resumeImageUrl(item)" :alt="item.title" :kind="item.kind"
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
            <div v-if="offlineStore.isItemDownloaded(item.id)"
              class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none">
              <DownloadIcon class="size-3 text-white" />
            </div>
            <div v-else-if="downloadStore.isDownloading(item.id)"
              class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none animate-pulse">
              <Loader2 class="size-3 text-white animate-spin" />
            </div>

            <!-- Mark as played button -->
            <button @click.stop="markPlayed(item)" :title="t('home.markPlayed')" :aria-label="t('home.markPlayed')"
              class="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white/70
                     opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/80 hover:text-white
                     transition-all duration-200 cursor-pointer pointer-events-auto">
              <Loader2 v-if="markingPlayed.has(item.id)" class="size-3 animate-spin" />
              <Check v-else class="size-3" />
            </button>

            <!-- Progress bar — after overlay in DOM so it always renders on top -->
            <div class="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div class="h-full bg-accent-purple transition-all"
                :style="{ width: playedPercent(item) + '%' }" />
            </div>
          </div>

          <!-- Title -->
          <div class="px-0.5 cursor-pointer" @click="goToItem(item)">
            <div class="text-xs font-semibold text-text-heading truncate hover:text-accent-purple-light transition-colors"
                 :title="resumeTitle(item)">
              {{ resumeTitle(item) }}
            </div>
            <div v-if="item.kind === 'episode'" class="text-xs text-text-muted truncate mt-0.5">
              S{{ item.seasonNumber }}E{{ item.episodeNumber }}
            </div>
            <div v-if="remainingTime(item)" class="text-xs text-text-muted mt-0.5">
              {{ remainingTime(item) }}
            </div>
          </div>
        </div>
      </MediaRail>
    </Section>

    <!-- Next Up -->
    <Section v-if="nextUpItems.length" :title="t('home.nextUp')">
      <MediaRail>
        <div v-for="item in nextUpItems" :key="item.id" class="shrink-0 w-44 sm:w-52 group">
          <!-- Thumbnail -->
          <div class="relative rounded-xl overflow-hidden bg-surface-raised aspect-video mb-1.5
                      group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200 cursor-pointer active:scale-[0.97] active:opacity-75"
               @click="playResume(item)">
            <LazyImg :src="resumeImageUrl(item)" :alt="item.title" :kind="item.kind"
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
            <div v-if="offlineStore.isItemDownloaded(item.id)"
              class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none">
              <DownloadIcon class="size-3 text-white" />
            </div>
            <div v-else-if="downloadStore.isDownloading(item.id)"
              class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none animate-pulse">
              <Loader2 class="size-3 text-white animate-spin" />
            </div>

            <!-- Mark as played button -->
            <button @click.stop="markPlayed(item)" :title="t('home.markPlayed')" :aria-label="t('home.markPlayed')"
              class="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white/70
                     opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/80 hover:text-white
                     transition-all duration-200 cursor-pointer pointer-events-auto">
              <Loader2 v-if="markingPlayed.has(item.id)" class="size-3 animate-spin" />
              <Check v-else class="size-3" />
            </button>
          </div>

          <!-- Title -->
          <div class="px-0.5 cursor-pointer" @click="goToItem(item)">
            <div class="text-xs font-semibold text-text-heading truncate hover:text-accent-purple-light transition-colors"
                 :title="item.seriesTitle || item.title">
              {{ item.seriesTitle || item.title }}
            </div>
            <div class="text-xs text-text-muted truncate mt-0.5">
              S{{ item.seasonNumber }}E{{ item.episodeNumber }} · {{ item.title }}
            </div>
          </div>
        </div>
      </MediaRail>
    </Section>

    <!-- Recently Added per library -->
    <template v-if="latestLoading">
      <section v-for="lib in libraries" :key="'latest-skeleton-' + lib.id" class="mt-section">
        <Skeleton class="mb-3 h-6 w-56 rounded-md" />
        <MediaRail>
          <Skeleton v-for="i in 5" :key="i" class="aspect-[2/3] w-32 shrink-0 rounded-xl sm:w-36" />
        </MediaRail>
      </section>
    </template>
    <template v-else>
      <Section v-for="lib in libraries" :key="'latest-' + lib.id"
        v-show="latestByLibrary[lib.id]?.length"
        :title="t('home.recentlyAdded', { library: lib.title })">
        <MediaRail>
          <div v-for="item in latestByLibrary[lib.id]" :key="item.id"
            class="shrink-0 w-32 sm:w-36 group cursor-pointer active:scale-[0.97] active:opacity-75 transition-all duration-200"
            @click="goToItem(item)">
            <div class="relative rounded-xl overflow-hidden bg-surface-raised mb-1.5 aspect-[2/3]
                        group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200">
              <LazyImg :src="imageUrl(item.images.poster, POSTER)" :alt="item.title" :kind="item.kind"
                class="block w-full h-full object-cover" />
              <!-- Download badge -->
              <div v-if="offlineStore.isItemDownloaded(item.id)"
                class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none">
                <DownloadIcon class="size-3 text-white" />
              </div>
              <div v-else-if="downloadStore.isDownloading(item.id)"
                class="absolute top-1.5 left-1.5 bg-accent-purple/80 rounded-full p-1 shadow pointer-events-none animate-pulse">
                <Loader2 class="size-3 text-white animate-spin" />
              </div>
            </div>
            <div class="px-0.5 text-xs font-semibold text-text-heading truncate
                        group-hover:text-accent-purple-light transition-colors"
              :title="item.title">
              {{ item.title }}
            </div>
            <div v-if="item.year" class="px-0.5 text-xs text-text-muted mt-0.5">
              {{ item.year }}
            </div>
          </div>

          <!-- View all button -->
          <router-link
            :to="{ name: 'libraryItem', params: { id: lib.id, name: lib.title } }"
            class="shrink-0 w-32 sm:w-36 flex flex-col items-center justify-center gap-2
                   aspect-[2/3] rounded-xl border border-white/10 bg-white/5
                   hover:bg-white/10 hover:border-white/20 transition-colors group">
            <ArrowRight class="size-6 text-text-muted group-hover:text-accent-purple-light transition-colors" />
            <span class="text-xs font-medium text-text-muted group-hover:text-accent-purple-light transition-colors">
              {{ t('common.seeAll') }}
            </span>
          </router-link>
        </MediaRail>
      </Section>
    </template>

    <!-- Libraries -->
    <Section :title="t('home.myLibraries')">

      <!-- Loading state -->
      <MediaRail v-if="loading">
        <Skeleton v-for="i in 6" :key="i" class="aspect-video w-44 shrink-0 rounded-xl sm:w-52" />
      </MediaRail>

      <!-- Error state -->
      <div v-else-if="error" class="p-10 text-center">
        <p class="text-error text-lg">{{ error }}</p>
      </div>

      <!-- Library row -->
      <MediaRail v-else>
        <router-link v-for="item in libraries" :key="item.id"
          class="shrink-0 w-44 sm:w-52 group active:scale-[0.97] active:opacity-75 transition-all duration-200"
          :to="{ name: 'libraryItem', params: { id: item.id, name: item.title } }">
          <div class="relative rounded-xl overflow-hidden bg-surface-raised aspect-video mb-1.5
                      group-hover:-translate-y-1 group-hover:shadow-xl transition-all duration-200">
            <LazyImg :src="imageUrl(item.images.poster, LIBRARY_TILE)" :alt="item.title"
              class="block w-full h-full object-cover" />
          </div>
          <div class="px-0.5 text-xs font-semibold text-text-heading truncate
                      group-hover:text-accent-purple-light transition-colors">
            {{ item.title }}
          </div>
        </router-link>
      </MediaRail>
    </Section>
    </template>
  </AppPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { playedPercent, remainingMs } from '@/domain';
import type { Episode, ImageSize, Library, MediaItem } from '@/domain';
import { useBackend, useImageUrl } from '@/composables/useBackend';
import { useHomeStore } from '@/store/home-store';
import { useLibrariesStore } from '@/store/libraries-store';
import { useSessionStore } from '@/store/session-store';
import LazyImg from '@/components/LazyImg.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AppPage, MediaRail, PageHeader, Section } from '@/components/layout';
import { formatRemaining } from '@/i18n/format';
import { Airplay, ArrowRight, Cast, Check, Download as DownloadIcon, Loader2, Play, RefreshCw } from 'lucide-vue-next';
import AirPlayDialog from '@/components/AirPlayDialog.vue';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { audioPlayerService } from '@/services/audioPlayerService';
import { useOfflineStore } from '@/store/offline-store';
import { useDownloadStore } from '@/store/download-store';
import { useRetryWhileFailed } from '@/composables/useRetryWhileFailed';
import OfflineHome from '@/components/offline/OfflineHome.vue';

const { t } = useI18n();
const backend = useBackend();
const imageUrl = useImageUrl();
const session = useSessionStore();
const homeStore = useHomeStore();
const librariesStore = useLibrariesStore();
const offlineStore = useOfflineStore();
const downloadStore = useDownloadStore();
const router = useRouter();

// Rendered sizes in CSS px (useImageUrl scales them to the screen density).
const POSTER: ImageSize = { width: 144, height: 216 }; // w-36 rail card
const RESUME_IMAGE: ImageSize = { width: 208, height: 117 }; // w-52 16:9 card
const LIBRARY_TILE: ImageSize = { width: 208, height: 117 };
const RESUME_LIMIT = 12;
const UP_NEXT_LIMIT = 20;
const LATEST_LIMIT = 10;
const MIN_REMAINING_MS = 60_000;

const libraries = ref<Library[]>([]);
const resumeItems = ref<MediaItem[]>([]);
const nextUpItems = ref<Episode[]>([]);
const latestByLibrary = ref<Record<string, MediaItem[]>>({});
const loading = ref(true);
const latestLoading = ref(false);
const refreshing = ref(false);
const audioStore = useAudioPlayerStore();
const showAirPlay = ref(false);
const error = ref<string | null>(null);

function restoreCachedHome(): boolean {
  const snapshot = homeStore.snapshot;
  if (!snapshot || snapshot.accountKey !== session.activeKey) return false;
  libraries.value = snapshot.libraries;
  resumeItems.value = snapshot.resumeItems;
  nextUpItems.value = snapshot.upNext;
  latestByLibrary.value = snapshot.latestByLibrary;
  loading.value = false;
  latestLoading.value = false;
  return true;
}

function cacheCurrentHome() {
  if (!session.activeKey) return;
  homeStore.snapshot = {
    accountKey: session.activeKey,
    libraries: libraries.value,
    resumeItems: resumeItems.value,
    upNext: nextUpItems.value,
    latestByLibrary: latestByLibrary.value,
  };
}

const isOffline = computed(() => !offlineStore.isFullyOnline);

async function loadLatest(libs: Library[]) {
  latestLoading.value = Object.keys(latestByLibrary.value).length === 0;
  const latest = await Promise.all(libs.map((lib) => backend.value.catalog.latest(lib.id, LATEST_LIMIT)));
  latestByLibrary.value = Object.fromEntries(libs.map((lib, index) => [lib.id, latest[index]]));
}

async function loadMedia(force = false) {
  if (isOffline.value) return;
  // A stale snapshot stays rendered while fresh data loads without a spinner.
  if (!force && restoreCachedHome() && !homeStore.snapshot?.isStale) return;

  const hasCachedContent = libraries.value.length > 0;
  loading.value = !hasCachedContent;
  refreshing.value = force;
  error.value = null;
  try {
    const [libs, resume, upNext] = await Promise.all([
      librariesStore.refresh(),
      backend.value.catalog.resumeItems(RESUME_LIMIT),
      backend.value.catalog.upNext(UP_NEXT_LIMIT),
    ]);
    void offlineStore.cacheLibraryArtwork();
    libraries.value = libs;
    resumeItems.value = resume;
    const resumeIds = new Set(resume.map((item) => item.id));
    nextUpItems.value = upNext.filter((item) => !resumeIds.has(item.id));
    loading.value = false;
    await loadLatest(libs);
    cacheCurrentHome();
  } catch {
    if (!hasCachedContent) error.value = t('home.loadError');
  } finally {
    loading.value = false;
    latestLoading.value = false;
    refreshing.value = false;
  }
}

/** Wide art for the resume rows: the item's backdrop (series backdrop for episodes), else its still or poster. */
function resumeImageUrl(item: MediaItem): string {
  return imageUrl(item.images.backdrop ?? item.images.thumb ?? item.images.poster, RESUME_IMAGE);
}

function resumeTitle(item: MediaItem): string {
  return item.kind === 'episode' ? item.seriesTitle || item.title : item.title;
}

function remainingTime(item: MediaItem): string {
  const left = remainingMs(item);
  return left < MIN_REMAINING_MS ? '' : formatRemaining(Math.floor(left / 1000));
}

const markingPlayed = ref<Set<string>>(new Set());

async function markPlayed(item: MediaItem) {
  if (markingPlayed.value.has(item.id)) return;
  markingPlayed.value.add(item.id);
  try {
    await backend.value.userData.setPlayed(item.id, true);
    resumeItems.value = resumeItems.value.filter((candidate) => candidate.id !== item.id);
    nextUpItems.value = nextUpItems.value.filter((candidate) => candidate.id !== item.id);
    cacheCurrentHome();
  } finally {
    markingPlayed.value.delete(item.id);
  }
}

function playResume(item: MediaItem) {
  const startMs = item.user.resumePositionMs;
  router.push({ name: 'Player', params: { id: item.id }, query: startMs ? { startMs: String(startMs) } : {} });
}

function goToItem(item: MediaItem) {
  router.push({ name: 'ItemDetails', params: { id: item.id } });
}

useRetryWhileFailed(computed(() => error.value !== null), () => loadMedia());

watch(isOffline, (offline) => { if (!offline) loadMedia(); });

onMounted(() => {
  loadMedia();
});
</script>
