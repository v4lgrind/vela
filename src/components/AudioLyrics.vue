<template>
  <div ref="scroller" data-lyrics-scroll class="relative overflow-y-auto scrollbar-hide py-24 px-2"
    style="mask-image: linear-gradient(transparent, black 15%, black 85%, transparent)"
    @touchstart.passive="onUserScroll" @wheel.passive="onUserScroll">
    <template v-if="lyrics.synced">
      <p v-for="(line, i) in lyrics.lines" :key="i" ref="lineEls"
        class="py-2 text-2xl font-bold leading-snug cursor-pointer transition-colors duration-100"
        :class="i === active ? 'text-text-heading' : 'text-text-muted/40'"
        @click="audioStore.seek((line.startMs ?? 0) / 1000)">
        {{ line.text || '♪' }}
      </p>
    </template>
    <p v-else v-for="(line, i) in lyrics.lines" :key="i" class="min-h-6 text-lg leading-relaxed text-text-primary">
      {{ line.text }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import type { Lyrics } from '@/domain';
import { activeLyricIndex } from '@/utils/lyrics';

const props = defineProps<{ lyrics: Lyrics }>();
const audioStore = useAudioPlayerStore();

const scroller = ref<HTMLElement | null>(null);
const lineEls = ref<HTMLElement[]>([]);

// The engine reports the position about once a second; advance it locally
// in between so the highlight changes on time.
const now = ref(performance.now());
let reportedAt = performance.now();
watch(() => audioStore.currentTime, () => { reportedAt = performance.now(); });
let frame = 0;
function tick() {
  now.value = performance.now();
  frame = requestAnimationFrame(tick);
}
frame = requestAnimationFrame(tick);
onBeforeUnmount(() => cancelAnimationFrame(frame));

const position = computed(() => {
  if (!audioStore.isPlaying) return audioStore.currentTime;
  return audioStore.currentTime + Math.max(0, now.value - reportedAt) / 1000;
});

const active = computed(() => activeLyricIndex(props.lyrics.lines, position.value));

// Follow the active line, unless the user scrolled in the last few seconds.
const USER_SCROLL_PAUSE_MS = 3000;
let userScrolledAt = 0;

function onUserScroll() {
  userScrolledAt = performance.now();
}

function centerLine(index: number, behavior: ScrollBehavior) {
  const el = lineEls.value[index];
  const box = scroller.value;
  if (!el || !box) return;
  box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2, behavior });
}

watch(active, (index) => {
  if (performance.now() - userScrolledAt < USER_SCROLL_PAUSE_MS) return;
  centerLine(index, 'smooth');
}, { flush: 'post' });

onMounted(() => centerLine(active.value, 'instant'));
</script>
