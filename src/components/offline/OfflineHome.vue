<template>
  <div class="flex flex-col gap-6">
    <OfflineBanner />

    <EmptyState v-if="!resume.length && !musicRows.length" :icon="Download" :title="t('offline.noDownloads')" />

    <Section v-if="resume.length" :title="t('home.continueWatching')">
      <MediaRail>
        <button v-for="{ media, progress } in resume" :key="media.itemId" type="button"
          class="w-44 shrink-0 text-left sm:w-52" @click="play(media.itemId, progress.position)">
          <div class="relative mb-1.5 aspect-video overflow-hidden rounded-xl bg-surface-raised active:scale-[0.97]">
            <LazyImg :src="artworkUrl(media.itemId, '')" :alt="media.name" :item-type="media.type"
              class="block h-full w-full object-cover" />
            <div class="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div class="h-full bg-accent-purple" :style="{ width: progress.percentage + '%' }" />
            </div>
          </div>
          <div class="truncate px-0.5 text-xs font-semibold text-text-heading">{{ media.seriesName || media.name }}</div>
          <div v-if="media.type === 'Episode'" class="truncate px-0.5 text-xs text-text-muted">
            S{{ media.seasonNumber }}E{{ media.episodeNumber }}
          </div>
          <div v-if="timeLeft(media, progress.position)" class="px-0.5 text-xs text-text-muted">
            {{ timeLeft(media, progress.position) }}
          </div>
        </button>
      </MediaRail>
    </Section>

    <!-- One row per music library: audiobooks never mix into the music. -->
    <Section v-for="row in musicRows" :key="row.library.Id!" :title="row.library.Name || ''">
      <template #actions>
        <Button variant="secondary" size="sm" class="rounded-full" @click="shuffle(row.tracks)">
          <Shuffle class="size-4" /> {{ t('library.music.shuffleAll') }}
        </Button>
      </template>
      <MediaRail>
        <router-link v-for="album in row.albums" :key="album.Id" :to="{ name: 'ItemDetails', params: { id: album.Id } }"
          class="w-28 shrink-0">
          <div class="mb-1.5 aspect-square overflow-hidden rounded-xl bg-surface-raised">
            <LazyImg :src="artworkUrl(album.Id, '')" :alt="album.Name" item-type="MusicAlbum"
              class="block h-full w-full object-cover" />
          </div>
          <div class="truncate px-0.5 text-xs font-semibold text-text-heading">{{ album.Name }}</div>
        </router-link>
      </MediaRail>
    </Section>

    <router-link v-if="resume.length || musicRows.length" :to="{ name: 'libraryList' }"
      class="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-purple">
      {{ t('home.seeAllDownloads') }}
    </router-link>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Download, Shuffle } from 'lucide-vue-next';

import LazyImg from '@/components/LazyImg.vue';
import { EmptyState, MediaRail, Section } from '@/components/layout';
import OfflineBanner from '@/components/offline/OfflineBanner.vue';
import { Button } from '@/components/ui/button';
import { useOfflineArtwork } from '@/composables/useOfflineArtwork';
import { formatRemaining } from '@/i18n/format';
import { offlineDatabase, type DownloadedMedia, type WatchProgress } from '@/services/offlineDatabase';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { useOfflineStore } from '@/store/offline-store';
import { shuffleAround } from '@/utils/audioQueue';
import { toAudioTrack } from '@/utils/audioTrack';
import { downloadedTracks, downloadsInLibrary, localLibraryPage } from '@/utils/offlineLibrary';
import { resumeCandidates } from '@/utils/watchProgress';

const { t } = useI18n();
const router = useRouter();
const store = useJellyfinStore();
const offlineStore = useOfflineStore();
const audioStore = useAudioPlayerStore();
const { artworkUrl, preload } = useOfflineArtwork();

const localProgress = ref(new Map<string, WatchProgress>());
const resume = computed(() => resumeCandidates(offlineStore.downloads, localProgress.value));

const ALBUMS = {
  startIndex: 0, limit: 30, sortBy: 'SortName', sortOrder: 'Ascending' as const,
  unplayedOnly: false, favoritesOnly: false, genres: [], nameStartsWith: '', seed: 1,
};
const musicRows = computed(() => store.libraries
  .filter((library) => library.CollectionType === 'music')
  .map((library) => {
    const downloads = downloadsInLibrary(offlineStore.downloads, library, store.libraries);
    return { library, tracks: downloadedTracks(downloads), albums: localLibraryPage(downloads, 'albums', 'music', ALBUMS).items };
  })
  .filter((row) => row.tracks.length));

function timeLeft(media: DownloadedMedia, position: number): string {
  const total = (media.jellyfinItem?.RunTimeTicks ?? 0) / 10_000_000;
  const left = Math.floor(total - position);
  return left >= 60 ? formatRemaining(left) : '';
}

function play(itemId: string, position: number) {
  router.push({ name: 'Player', params: { id: itemId }, query: { startTicks: String(Math.floor(position * 10_000_000)) } });
}

function shuffle(tracks: any[]) {
  const queue = tracks.map((track) => toAudioTrack(track));
  audioStore.playAlbum(shuffleAround(queue, Math.floor(Math.random() * queue.length)), 0);
}

async function loadLocalProgress() {
  const entries = await Promise.all(offlineStore.downloads
    .filter((download) => download.type === 'Movie' || download.type === 'Episode')
    .map(async (download) => [download.itemId, await offlineDatabase.getWatchProgress(download.itemId)] as const));
  localProgress.value = new Map(entries.filter((entry): entry is readonly [string, WatchProgress] => entry[1] !== null));
}

watch(() => offlineStore.downloads, () => {
  void loadLocalProgress();
  void preload(offlineStore.downloads.flatMap((download) => [download.itemId, download.albumId ?? '']));
}, { immediate: true });
onMounted(loadLocalProgress);
</script>
