<template>
  <div class="flex flex-col gap-2">
    <div v-if="loading" class="flex items-center justify-center gap-2.5 py-16 text-text-muted">
      <Loader2 class="size-5 animate-spin" />
    </div>
    <EmptyState v-else-if="error" :icon="TriangleAlert" :title="t('library.loadError')" />
    <EmptyState v-else-if="!charts.tracks.length" :icon="Trophy" :title="t('library.charts.empty')" />

    <template v-else>
      <Section v-if="charts.artists.length" :title="t('library.charts.artists')">
        <MediaRail role="list">
          <router-link v-for="artist in charts.artists" :key="artist.id" role="listitem"
            :to="{ name: 'ItemDetails', params: { id: artist.id } }" class="w-28 shrink-0 text-center active:opacity-75">
            <div class="size-28 overflow-hidden rounded-full bg-surface-raised">
              <LazyImg :src="artistImage(artist.id)" :alt="artist.name" kind="artist" class="size-full object-cover" />
            </div>
            <div class="mt-1.5 truncate text-xs font-medium text-text-heading">{{ artist.name }}</div>
            <div class="text-label text-text-muted">{{ t('library.charts.plays', artist.plays) }}</div>
          </router-link>
        </MediaRail>
      </Section>

      <Section v-if="charts.albums.length" :title="t('library.charts.albums')">
        <MediaRail role="list">
          <MusicContextMenu v-for="album in charts.albums" :key="album.id" :target="{ kind: 'album', id: album.id, artists: album.artists }">
            <router-link role="listitem" :to="{ name: 'ItemDetails', params: { id: album.id } }"
              class="w-32 shrink-0 select-none active:opacity-75">
              <div class="aspect-square overflow-hidden rounded-xl bg-surface-raised">
                <LazyImg :src="imageUrl(album.cover, SQUARE)" :alt="album.title" kind="album" class="size-full object-cover" draggable="false" />
              </div>
              <div class="mt-1.5 truncate text-xs font-medium text-text-heading">{{ album.title }}</div>
              <div class="truncate text-label text-text-muted">{{ album.artist }}</div>
            </router-link>
          </MusicContextMenu>
        </MediaRail>
      </Section>

      <Section :title="t('library.charts.tracks')">
        <ol class="m-0 flex list-none flex-col p-0">
          <MusicContextMenu v-for="(track, i) in charts.tracks" :key="track.id" :target="trackTarget(track)" :track="track">
            <li class="flex cursor-pointer select-none items-center gap-3 border-b border-border-default px-1 py-2 active:opacity-80"
              :class="audioStore.currentTrack?.id === track.id && 'bg-accent-purple/10'" @click="playFrom(i)">
              <span class="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-text-subtle">{{ i + 1 }}</span>
              <div class="size-12 shrink-0 overflow-hidden rounded-md bg-black/60">
                <LazyImg :src="imageUrl(track.images.poster, THUMB)" :alt="track.albumTitle" kind="album" class="block size-full object-cover" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-semibold text-text-heading">{{ track.title }}</div>
                <div class="truncate text-xs text-text-muted">
                  {{ [track.albumArtist || track.artists[0]?.name, t('library.charts.plays', track.user.playCount)].filter(Boolean).join(' · ') }}
                </div>
              </div>
              <TrackActionsMenu :track="track" @play-next="enqueue(track, 'next')" @add-to-queue="enqueue(track, 'end')" />
            </li>
          </MusicContextMenu>
        </ol>
      </Section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loader2, TriangleAlert, Trophy } from 'lucide-vue-next';

import LazyImg from '@/components/LazyImg.vue';
import TrackActionsMenu from '@/components/TrackActionsMenu.vue';
import { EmptyState, MediaRail, Section } from '@/components/layout';
import { useBackend, useImageUrl } from '@/composables/useBackend';
import { useToast } from '@/composables/useToast';
import type { ImageRef, ImageSize, Track } from '@/domain';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { trackToAudioTrack } from '@/utils/audioTrack';
import { musicCharts, type MusicCharts } from '@/utils/musicCharts';
import { trackTarget } from '@/utils/musicActions';
import { logger } from '@/utils/logger';

import MusicContextMenu from './MusicContextMenu.vue';

/** Tracks read to build the charts: albums and artists add up their tracks. */
const CHART_SOURCE = 500;
const SQUARE: ImageSize = { width: 256, height: 256 };
const THUMB: ImageSize = { width: 96, height: 96 };
const TOAST_MS = 2000;

const props = defineProps<{ libraryId: string }>();
const { t } = useI18n();
const backend = useBackend();
const imageUrl = useImageUrl();
const audioStore = useAudioPlayerStore();
const toast = useToast();

const charts = ref<MusicCharts>({ artists: [], albums: [], tracks: [] });
const artistImages = ref(new Map<string, ImageRef | undefined>());
const loading = ref(true);
const error = ref(false);

function artistImage(id: string): string {
  return imageUrl(artistImages.value.get(id), SQUARE);
}

async function load() {
  loading.value = true;
  error.value = false;
  try {
    charts.value = musicCharts(await backend.value.music.mostPlayed(props.libraryId, CHART_SOURCE));
    const artists = charts.value.artists.length ? await backend.value.catalog.items(charts.value.artists.map((a) => a.id)) : [];
    artistImages.value = new Map(artists.map((artist) => [artist.id, artist.images.poster]));
  } catch (e) {
    logger.warn('[Charts] Load failed', e);
    error.value = true;
  } finally {
    loading.value = false;
  }
}

function playFrom(index: number) {
  audioStore.playAlbum(charts.value.tracks.map((track) => trackToAudioTrack(track)), index);
}

function enqueue(track: Track, where: 'next' | 'end') {
  if (where === 'next') audioStore.playNext([trackToAudioTrack(track)]);
  else audioStore.addToQueue([trackToAudioTrack(track)]);
  toast.show(where === 'next' ? t('audio.playingNext') : t('audio.addedToQueue'), 'success', TOAST_MS);
}

onMounted(load);
watch(() => props.libraryId, load);
</script>
