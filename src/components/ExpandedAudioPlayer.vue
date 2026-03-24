<template>
  <div class="fixed inset-0 z-200 bg-[radial-gradient(circle_at_top,#1a1a2e_0%,#0a0a0a_70%)] text-text-primary flex flex-col overflow-y-auto"
    style="padding: var(--sat, env(safe-area-inset-top, 12px)) 16px calc(16px + var(--sab, env(safe-area-inset-bottom, 0px)))">

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
        <div class="w-full h-6 flex items-center cursor-pointer group" @click="seekFromProgress">
          <div class="w-full h-1 bg-white/20 rounded-sm relative group-hover:h-1.5 transition-[height]">
            <div class="h-full bg-accent-purple rounded-sm transition-[width] duration-300 ease-linear" :style="{ width: audioStore.progress + '%' }"></div>
          </div>
        </div>
        <div class="flex justify-between text-xs text-text-muted tabular-nums mt-1">
          <span>{{ formatTime(audioStore.currentTime) }}</span>
          <span>{{ formatTime(audioStore.duration) }}</span>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-6">
        <Button variant="ghost" size="icon" class="size-14 rounded-full text-text-primary hover:bg-white/10 disabled:opacity-30" :disabled="!audioStore.hasPrevious && audioStore.currentTime <= 3" @click="audioStore.previous()">
          <SkipBack class="size-8 fill-current" />
        </Button>
        <Button size="icon" class="size-16 rounded-full bg-white text-black hover:bg-white/90" @click="audioStore.togglePlayPause()">
          <Play v-if="!audioStore.isPlaying" class="size-9 fill-current stroke-none" />
          <Pause v-else class="size-9 fill-current stroke-none" />
        </Button>
        <Button variant="ghost" size="icon" class="size-14 rounded-full text-text-primary hover:bg-white/10 disabled:opacity-30" :disabled="!audioStore.hasNext" @click="audioStore.next()">
          <SkipForward class="size-8 fill-current" />
        </Button>
      </div>

      <!-- Volume -->
      <div class="flex items-center gap-2.5 w-full max-w-[300px]">
        <Volume2 v-if="audioStore.volume > 50" class="size-5 text-text-muted shrink-0" />
        <Volume1 v-else-if="audioStore.volume > 0" class="size-5 text-text-muted shrink-0" />
        <VolumeX v-else class="size-5 text-text-muted shrink-0" />
        <Slider :model-value="[audioStore.volume]" :max="100" :step="1" class="flex-1" @update:model-value="(v?: number[]) => v && audioStore.setVolume(v[0])" />
      </div>
    </div>

    <!-- Queue -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <h3 class="text-lg font-semibold mb-3">Queue</h3>
      <div class="flex-1 overflow-y-auto flex flex-col gap-0.5 scrollbar-hide">
        <div
          v-for="(track, i) in audioStore.queue"
          :key="track.id"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-white/5"
          :class="i === audioStore.currentIndex && 'bg-accent-purple/15'"
          @click="jumpToTrack(i)"
        >
          <div class="w-7 text-center text-text-muted text-sm shrink-0">{{ track.indexNumber || i + 1 }}</div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-text-heading truncate" :class="i === audioStore.currentIndex && 'text-accent-purple-light'">{{ track.name }}</div>
            <div class="text-xs text-text-muted truncate">{{ track.artist }}</div>
          </div>
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
import { ChevronDown, ListMusic, SkipBack, SkipForward, Play, Pause, Volume2, Volume1, VolumeX } from 'lucide-vue-next';

const audioStore = useAudioPlayerStore();
const jellyfinStore = useJellyfinStore();

const showQueue = ref(false);

const currentTrack = computed(() => audioStore.currentTrack);

const albumArtUrl = computed(() => {
  const track = currentTrack.value;
  if (!track) return '';
  return jellyfinStore.getImageUrl(track.albumId || track.id, 'Primary', 560, 560);
});

function seekFromProgress(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement;
  const ratio = e.offsetX / bar.offsetWidth;
  audioStore.seek(ratio * audioStore.duration);
}

function jumpToTrack(index: number) {
  audioStore.currentIndex = index;
  audioStore.isPlaying = true;
}
</script>
