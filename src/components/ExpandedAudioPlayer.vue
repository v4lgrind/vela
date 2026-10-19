<template>
  <div ref="sheet" class="fixed inset-0 z-200 bg-[radial-gradient(circle_at_top,#1a1a2e_0%,#0a0a0a_70%)] text-text-primary flex flex-col overflow-y-auto"
    :class="swipeStartY === null && 'transition-transform duration-200'"
    :style="{ padding: 'var(--sat, env(safe-area-inset-top, 12px)) 16px calc(16px + var(--sab, env(safe-area-inset-bottom, 0px)))', transform: `translateY(${sheetOffset}px)` }"
    @touchstart.passive="onSwipeStart" @touchmove.passive="onSwipeMove" @touchend="onSwipeEnd" @touchcancel="onSwipeEnd">

    <!-- Header -->
    <div class="flex items-center justify-between py-2 shrink-0">
      <Button variant="ghost" size="icon" class="size-11 rounded-full text-text-primary hover:bg-white/10" @click="audioStore.isExpanded = false">
        <ChevronDown class="size-7" />
      </Button>
      <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">Now Playing</span>
      <Button variant="ghost" size="icon" class="size-11 rounded-full text-text-primary hover:bg-white/10" @click="showQueue = !showQueue">
        <ListMusic class="size-7" />
      </Button>
    </div>

    <!-- Main Player -->
    <div v-if="!showQueue" class="flex-1 flex flex-col items-center justify-center gap-6 py-4">
      <img v-if="albumArtUrl" :src="albumArtUrl" class="size-70 rounded-xl object-cover shadow-[0_20px_60px_rgba(0,0,0,0.5)]" alt="Cover" />
      <div v-else class="size-70 rounded-xl bg-border-input"></div>

      <div class="text-center max-w-full">
        <div class="text-xl font-bold text-white truncate">{{ currentTrack?.name || '' }}</div>
        <div class="text-base text-text-muted mt-1">{{ currentTrack?.artist || '' }}</div>
        <div v-if="currentTrack?.albumName" class="text-sm text-text-subtle mt-0.5">{{ currentTrack.albumName }}</div>
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
        <Button variant="ghost" size="icon" title="Shuffle"
          class="size-12 rounded-full hover:bg-white/10"
          :class="audioStore.shuffle ? 'text-accent-purple' : 'text-text-muted'"
          @click="audioStore.toggleShuffle()">
          <Shuffle class="size-6" />
        </Button>
        <Button variant="ghost" size="icon" class="size-14 rounded-full text-text-primary hover:bg-white/10 disabled:opacity-30" :disabled="!audioStore.hasPrevious && audioStore.currentTime <= 3" @click="audioStore.previous()">
          <SkipBack class="size-8 fill-current" />
        </Button>
        <Button size="icon" class="size-16 rounded-full bg-white text-black hover:bg-white/90" @click="audioStore.togglePlayPause()">
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
      <h3 class="text-lg font-semibold mb-3">Queue</h3>
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
          <button data-no-swipe title="Drag to reorder" class="size-10 flex items-center justify-center text-text-subtle touch-none cursor-grab shrink-0"
            @click.stop @pointerdown="onDragStart($event, i)" @pointermove="onDragMove" @pointerup="onDragEnd" @pointercancel="onDragEnd">
            <GripVertical class="size-5" />
          </button>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-text-heading truncate" :class="i === audioStore.currentIndex && 'text-accent-purple-light'">{{ track.name }}</div>
            <div class="text-xs text-text-muted truncate">{{ track.artist }}</div>
          </div>
          <Button v-if="i !== audioStore.currentIndex" variant="ghost" size="icon" title="Remove from queue"
            class="size-10 rounded-full text-text-subtle hover:bg-white/10 shrink-0"
            @click.stop="audioStore.removeFromQueue(i)">
            <X class="size-5" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { formatTime } from '@/utils/helpers';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ChevronDown, GripVertical, ListMusic, SkipBack, SkipForward, Play, Pause, Repeat, Repeat1, Shuffle, Volume2, Volume1, VolumeX, X } from 'lucide-vue-next';

const audioStore = useAudioPlayerStore();
const jellyfinStore = useJellyfinStore();

const showQueue = ref(false);

const currentTrack = computed(() => audioStore.currentTrack);

const albumArtUrl = computed(() => {
  const track = currentTrack.value;
  if (!track) return '';
  return jellyfinStore.getImageUrl(track.albumId || track.id, 'Primary', 560, 560);
});

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
  const queueScroll = target.closest('[data-queue-scroll]');
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
