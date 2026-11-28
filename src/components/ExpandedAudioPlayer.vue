<template>
  <div ref="sheet" class="fixed inset-0 z-200 audio-player-bg text-text-primary flex flex-col overflow-y-auto"
    :class="swipeStartY === null && 'transition-transform duration-200'"
    :style="{ padding: 'var(--sat, env(safe-area-inset-top, 12px)) 16px calc(16px + var(--sab, env(safe-area-inset-bottom, 0px)))', transform: `translateY(${sheetOffset}px)` }"
    @touchstart.passive="onSwipeStart" @touchmove.passive="onSwipeMove" @touchend="onSwipeEnd" @touchcancel="onSwipeEnd">

    <!-- Cover backdrop: fixed inside the swiped sheet (its transform makes it the containing block) -->
    <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <Transition enter-active-class="transition-opacity duration-400" leave-active-class="transition-opacity duration-400"
        enter-from-class="opacity-0" leave-to-class="opacity-0">
        <div v-if="albumArtUrl && !artFailed" :key="albumArtUrl" class="absolute inset-0">
          <img :src="albumArtUrl" alt="" class="absolute inset-0 size-full scale-125 object-cover audio-player-art" />
          <div class="absolute inset-0 audio-player-scrim"></div>
        </div>
      </Transition>
    </div>

    <!-- Header: close, what plays where, more -->
    <div class="flex items-center gap-2 py-2 shrink-0">
      <Button variant="ghost" size="icon" class="size-11 shrink-0 rounded-full text-text-primary hover:bg-white/10" :aria-label="t('common.close')" @click="audioStore.isExpanded = false">
        <ChevronDown class="size-7" />
      </Button>
      <span v-if="audioStore.castDevice" class="flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-accent-purple">
        <Cast class="size-4 shrink-0" /> <span class="truncate">{{ audioStore.castDevice }}</span>
      </span>
      <span v-else-if="audioStore.airplayDevice" class="flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-accent-purple">
        <Airplay class="size-4 shrink-0" /> <span class="truncate">{{ audioStore.airplayDevice }}</span>
      </span>
      <span v-else class="min-w-0 flex-1 truncate whitespace-nowrap text-center text-xs font-semibold uppercase tracking-wide text-text-muted">{{ t('audio.nowPlaying') }}</span>
      <NowPlayingMenu :track="currentTrack" @sleep-timer="showSleepTimer = true" />
    </div>

    <!-- Main Player -->
    <div v-if="!showQueue" class="flex-1 flex flex-col items-center justify-center gap-6 py-4" :class="showLyrics && lyrics && 'min-h-0'">
      <AudioLyrics v-if="showLyrics && lyrics" :key="currentTrack?.id" :lyrics="lyrics" class="flex-1 min-h-0 w-full max-w-[600px]" />
      <img v-else-if="albumArtUrl && !artFailed" :key="artAttempt" @error="artFailed = true" :src="albumArtUrl" class="size-70 rounded-xl object-cover shadow-[0_20px_60px_rgba(0,0,0,0.5)]" :alt="t('audio.cover')" />
      <div v-else class="size-70 rounded-xl bg-border-input"></div>

      <div class="text-center max-w-full">
        <div class="text-xl font-bold text-text-heading truncate">{{ currentTrack?.name || '' }}</div>
        <div class="text-base text-text-muted mt-1">{{ currentTrack?.artist || '' }}</div>
        <div v-if="currentTrack?.albumName" class="text-sm text-text-subtle mt-0.5">{{ currentTrack.albumName }}</div>
        <button v-if="sleepLeft !== null" class="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-accent-purple tabular-nums hover:bg-white/10 cursor-pointer"
          :aria-label="t('audio.sleep.remaining', { time: formatTime(sleepLeft) })" @click="showSleepTimer = true">
          <Moon class="size-4" /> {{ formatTime(sleepLeft) }}
        </button>
      </div>

      <!-- Progress -->
      <div class="w-full max-w-[400px]">
        <Slider data-no-swipe class="h-8" :model-value="[seekPreview ?? audioStore.currentTime]" :max="audioStore.duration || 1" :step="1"
          @update:model-value="(v?: number[]) => v && (seekPreview = v[0])"
          @value-commit="(v: number[]) => commitSeek(v[0])" />
        <div class="flex justify-between text-xs text-text-muted tabular-nums mt-1">
          <span>{{ formatTime(seekPreview ?? audioStore.currentTime) }}</span>
          <span>{{ formatTime(audioStore.duration) }}</span>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" :aria-label="t('detail.shuffle')"
          class="size-12 rounded-full hover:bg-white/10"
          :class="audioStore.shuffle ? 'text-accent-purple' : 'text-text-muted'"
          @click="audioStore.toggleShuffle()">
          <Shuffle class="size-6" />
        </Button>
        <Button variant="ghost" size="icon" class="size-14 rounded-full text-text-primary hover:bg-white/10 disabled:opacity-30" :disabled="!audioStore.hasPrevious && audioStore.currentTime <= 3" @click="audioStore.previous()">
          <SkipBack class="size-8 fill-current" />
        </Button>
        <Button size="icon" class="size-16 rounded-full bg-text-heading text-background hover:bg-text-heading/90" @click="audioStore.togglePlayPause()">
          <Play v-if="!audioStore.isPlaying" class="size-9 fill-current stroke-none" />
          <Pause v-else class="size-9 fill-current stroke-none" />
        </Button>
        <Button variant="ghost" size="icon" class="size-14 rounded-full text-text-primary hover:bg-white/10 disabled:opacity-30" :disabled="!audioStore.hasNext && audioStore.repeatMode !== 'all'" @click="audioStore.next()">
          <SkipForward class="size-8 fill-current" />
        </Button>
        <Button variant="ghost" size="icon" :title="`Repeat: ${audioStore.repeatMode}`"
          class="size-12 rounded-full hover:bg-white/10"
          :class="audioStore.repeatMode !== 'off' ? 'text-accent-purple' : 'text-text-muted'"
          @click="audioStore.cycleRepeat()">
          <Repeat1 v-if="audioStore.repeatMode === 'one'" class="size-6" />
          <Repeat v-else class="size-6" />
        </Button>
      </div>

      <!-- Volume -->
      <div class="flex items-center gap-2.5 w-full max-w-[300px]">
        <Volume2 v-if="audioStore.volume > 50" class="size-5 text-text-muted shrink-0" />
        <Volume1 v-else-if="audioStore.volume > 0" class="size-5 text-text-muted shrink-0" />
        <VolumeX v-else class="size-5 text-text-muted shrink-0" />
        <Slider data-no-swipe :model-value="[audioStore.volume]" :max="100" :step="1" class="flex-1" @update:model-value="(v?: number[]) => v && audioStore.setVolume(v[0])" />
      </div>
    </div>

    <!-- Queue -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <h3 class="text-lg font-semibold mb-3">{{ t('audio.queue') }}</h3>
      <div data-queue-scroll class="flex-1 overflow-y-auto flex flex-col gap-0.5 scrollbar-hide">
        <div
          v-for="(track, i) in audioStore.queue"
          :key="`${track.id}-${i}`"
          data-queue-row
          class="flex items-center gap-2 pl-1 pr-1 py-1.5 rounded-lg cursor-pointer hover:bg-white/5"
          :class="[
            i === audioStore.currentIndex && 'bg-accent-purple/15',
            dragFrom === i ? 'relative z-10 bg-surface-raised shadow-lg' : 'transition-transform duration-150',
          ]"
          :style="{ transform: `translateY(${rowShift(i)}px)` }"
          @click="jumpToTrack(i)"
        >
          <button data-no-swipe :aria-label="t('audio.dragToReorder')" class="size-10 flex items-center justify-center text-text-subtle touch-none cursor-grab shrink-0"
            @click.stop @pointerdown="onDragStart($event, i)" @pointermove="onDragMove" @pointerup="onDragEnd" @pointercancel="onDragEnd">
            <GripVertical class="size-5" />
          </button>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-text-heading truncate" :class="i === audioStore.currentIndex && 'text-accent-purple-light'">{{ track.name }}</div>
            <div class="text-xs text-text-muted truncate">{{ track.artist }}</div>
          </div>
          <Button v-if="i !== audioStore.currentIndex" variant="ghost" size="icon" :aria-label="t('audio.removeFromQueue')"
            class="size-10 rounded-full text-text-subtle hover:bg-white/10 shrink-0"
            @click.stop="audioStore.removeFromQueue(i)">
            <X class="size-5" />
          </Button>
        </div>
      </div>
    </div>
    <!-- Bottom bar: lyrics, output, queue (always three slots, so nothing moves between tracks) -->
    <div class="flex shrink-0 items-center justify-around pt-3">
      <Button variant="ghost" size="icon" :aria-label="t('audio.lyrics')" :disabled="!lyrics"
        class="size-11 rounded-full hover:bg-white/10 disabled:opacity-30"
        :class="showLyrics && lyrics && !showQueue ? 'text-accent-purple' : 'text-text-primary'"
        @click="toggleLyrics">
        <MicVocal class="size-6" />
      </Button>
      <Button v-if="audioStore.airplaySupported && !audioStore.castDevice" variant="ghost" size="icon" title="AirPlay"
        class="size-11 rounded-full hover:bg-white/10"
        :class="audioStore.airplayDevice ? 'text-accent-purple' : 'text-text-primary'"
        @click="showAirPlay = true">
        <Airplay class="size-6" />
      </Button>
      <Button v-if="(audioStore.castAvailable || audioStore.castDevice) && !audioStore.airplayDevice" variant="ghost" size="icon" title="Cast"
        class="size-11 rounded-full hover:bg-white/10"
        :class="audioStore.castDevice ? 'text-accent-purple' : 'text-text-primary'"
        @click="audioPlayerService.openCastDialog()">
        <Cast class="size-6" />
      </Button>
      <Button variant="ghost" size="icon" class="size-11 rounded-full hover:bg-white/10" :aria-label="t('audio.queue')"
        :class="showQueue ? 'text-accent-purple' : 'text-text-primary'" @click="showQueue = !showQueue">
        <ListMusic class="size-6" />
      </Button>
    </div>
    <AirPlayDialog v-model:open="showAirPlay" />
    <SleepTimerSheet v-model:open="showSleepTimer" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, computed, watch } from 'vue';
import { useRetryWhileFailed } from '@/composables/useRetryWhileFailed';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { useImageUrl } from '@/composables/useBackend';
import { useSessionStore } from '@/store/session-store';
import { formatTime } from '@/utils/helpers';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { audioPlayerService } from '@/services/audioPlayerService';
import AirPlayDialog from '@/components/AirPlayDialog.vue';
import AudioLyrics from '@/components/AudioLyrics.vue';
import NowPlayingMenu from '@/components/music/NowPlayingMenu.vue';
import SleepTimerSheet from '@/components/music/SleepTimerSheet.vue';
import { sleepRemaining } from '@/utils/sleepTimer';
import { useNow } from '@vueuse/core';
import type { Lyrics } from '@/domain';
import { Airplay, Cast, ChevronDown, Moon, GripVertical, ListMusic, MicVocal, SkipBack, SkipForward, Play, Pause, Repeat, Repeat1, Shuffle, Volume2, Volume1, VolumeX, X } from 'lucide-vue-next';

const { t } = useI18n();
const audioStore = useAudioPlayerStore();
const session = useSessionStore();
const imageUrl = useImageUrl();

const showQueue = ref(false);
const showSleepTimer = ref(false);
const now = useNow({ interval: 1000 });
/** Seconds before the sleep timer pauses, null when none is set. */
const sleepLeft = computed(() => {
  const timer = audioStore.sleepTimer;
  if (!timer) return null;
  return sleepRemaining(timer, {
    now: now.value.getTime(), queue: audioStore.queue, currentIndex: audioStore.currentIndex,
    currentTime: audioStore.currentTime, duration: audioStore.duration,
  });
});
const showAirPlay = ref(false);

const currentTrack = computed(() => audioStore.currentTrack);

const albumArtUrl = computed(() => {
  const track = currentTrack.value;
  if (!track) return '';
  return imageUrl(track.artwork, { width: 280, height: 280 });
});

// A cover that failed to load (network cut while locked) is fetched again.
const artFailed = ref(false);
const artAttempt = ref(0);
watch(albumArtUrl, () => { artFailed.value = false; });
useRetryWhileFailed(artFailed, () => {
  artFailed.value = false;
  artAttempt.value++;
});

// Lyrics replace the cover; the button only shows when the track has some.
const lyrics = ref<Lyrics | null>(null);
const showLyrics = ref(false);

watch(() => currentTrack.value?.id, async (id) => {
  lyrics.value = null;
  if (!id) return;
  try {
    const backend = session.backend;
    if (!backend?.capabilities.lyrics) return;
    const found = await backend.music.lyrics(id);
    if (currentTrack.value?.id === id) lyrics.value = found;
  } catch {
    // Offline, or the server could not be reached.
  }
}, { immediate: true });

function toggleLyrics() {
  showLyrics.value = showQueue.value || !showLyrics.value;
  showQueue.value = false;
}

// While the thumb is dragged, show its position; seek once on release.
const seekPreview = ref<number | null>(null);

function commitSeek(seconds: number) {
  audioStore.seek(seconds);
  seekPreview.value = null;
}

// --- Swipe down anywhere (when nothing above is scrolled) to collapse.
const COLLAPSE_DISTANCE = 120;
const sheet = ref<HTMLElement | null>(null);
const sheetOffset = ref(0);
const swipeStartY = ref<number | null>(null);

function onSwipeStart(e: TouchEvent) {
  const target = e.target as HTMLElement;
  if (target.closest('[data-no-swipe]')) return;
  const queueScroll = target.closest('[data-queue-scroll], [data-lyrics-scroll]');
  if ((queueScroll && queueScroll.scrollTop > 0) || (sheet.value?.scrollTop ?? 0) > 0) return;
  swipeStartY.value = e.touches[0].clientY;
}

function onSwipeMove(e: TouchEvent) {
  if (swipeStartY.value === null) return;
  sheetOffset.value = Math.max(0, e.touches[0].clientY - swipeStartY.value);
}

function onSwipeEnd() {
  if (swipeStartY.value === null) return;
  if (sheetOffset.value > COLLAPSE_DISTANCE) audioStore.isExpanded = false;
  swipeStartY.value = null;
  sheetOffset.value = 0;
}

function jumpToTrack(index: number) {
  audioStore.jumpTo(index);
}

// --- Drag to reorder: the dragged row follows the finger, rows it passes
// slide out of the way, and the move is committed on release.
const dragFrom = ref<number | null>(null);
const dragTo = ref<number | null>(null);
const dragOffset = ref(0);
let dragStartY = 0;
let rowHeight = 0;

function onDragStart(e: PointerEvent, index: number) {
  const handle = e.currentTarget as HTMLElement;
  rowHeight = (handle.closest('[data-queue-row]') as HTMLElement).offsetHeight + 2;
  handle.setPointerCapture(e.pointerId);
  dragStartY = e.clientY;
  dragOffset.value = 0;
  dragFrom.value = index;
  dragTo.value = index;
}

function onDragMove(e: PointerEvent) {
  if (dragFrom.value === null) return;
  dragOffset.value = e.clientY - dragStartY;
  const target = dragFrom.value + Math.round(dragOffset.value / rowHeight);
  dragTo.value = Math.max(0, Math.min(audioStore.queue.length - 1, target));
}

function onDragEnd() {
  if (dragFrom.value !== null && dragTo.value !== null) {
    audioStore.moveInQueue(dragFrom.value, dragTo.value);
  }
  dragFrom.value = null;
  dragTo.value = null;
  dragOffset.value = 0;
}

function rowShift(index: number): number {
  const from = dragFrom.value;
  const to = dragTo.value;
  if (from === null || to === null) return 0;
  if (index === from) return dragOffset.value;
  if (from < to && index > from && index <= to) return -rowHeight;
  if (from > to && index >= to && index < from) return rowHeight;
  return 0;
}
</script>
