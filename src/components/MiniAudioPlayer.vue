<template>
  <div
    class="fixed inset-x-0 h-16 bg-surface-raised/95 backdrop-blur-sm z-90 flex flex-col cursor-pointer"
    :class="positionStyle ? '' : 'safe-pb bottom-0'"
    :style="positionStyle"
    @click="expand">
    <!-- Progress bar -->
    <div class="w-full h-[3px] bg-white/10 cursor-pointer shrink-0" @click.stop="seekFromProgress">
      <div class="h-full bg-accent-purple transition-[width] duration-300 ease-linear" :style="{ width: audioStore.progress + '%' }"></div>
    </div>
    <!-- Content -->
    <div class="flex-1 flex items-center px-3 gap-3">
      <img v-if="albumArtUrl && !artFailed" :key="artAttempt" :src="albumArtUrl" class="size-12 rounded-md object-cover shrink-0" :alt="t('audio.cover')"
        @error="artFailed = true" />
      <div v-else class="size-12 rounded-md bg-border-input shrink-0"></div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold text-text-heading truncate">{{ currentTrack?.name || '' }}</div>
        <div v-if="audioStore.castDevice" class="flex items-center gap-1 text-xs text-accent-purple truncate">
          <Cast class="size-3 shrink-0" /> {{ audioStore.castDevice }}
        </div>
        <div v-else-if="audioStore.airplayDevice" class="flex items-center gap-1 text-xs text-accent-purple truncate">
          <Airplay class="size-3 shrink-0" /> {{ audioStore.airplayDevice }}
        </div>
        <div v-else class="text-xs text-text-muted truncate">{{ currentTrack?.artist || '' }}</div>
      </div>
      <div class="flex items-center gap-1 shrink-0" @click.stop>
        <Button variant="ghost" size="icon" class="size-10 rounded-full text-text-primary hover:bg-white/10" @click="audioStore.previous()">
          <SkipBack class="size-5 fill-current" />
        </Button>
        <Button variant="ghost" size="icon" class="size-11 rounded-full text-text-primary hover:bg-white/10" @click="audioStore.togglePlayPause()">
          <Play v-if="!audioStore.isPlaying" class="size-7 fill-current" />
          <Pause v-else class="size-7 fill-current" />
        </Button>
        <Button variant="ghost" size="icon" class="size-10 rounded-full text-text-primary hover:bg-white/10" @click="audioStore.next()">
          <SkipForward class="size-5 fill-current" />
        </Button>
        <Button variant="ghost" size="icon" class="size-11 rounded-full text-text-muted hover:bg-white/10" :aria-label="t('audio.closePlayer')" @click="audioStore.stop()">
          <X class="size-5" />
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed, ref, watch } from 'vue';
import { useAudioPlayerStore } from '@/store/audio-player-store';
import { useJellyfinStore } from '@/store/jellyfin-store';
import { Button } from '@/components/ui/button';
import { Airplay, Cast, SkipBack, SkipForward, Play, Pause, X } from 'lucide-vue-next';
import { useBottomNavVisible } from '@/composables/useBottomNav';
import { useWideLayout } from '@/composables/useWideLayout';
import { useRetryWhileFailed } from '@/composables/useRetryWhileFailed';
import { miniPlayerStyle } from '@/utils/shellLayout';

const { t } = useI18n();
const audioStore = useAudioPlayerStore();
const jellyfinStore = useJellyfinStore();

// When the bottom nav is on screen, sit just above it (nav: 66px tall, 4px
// offset, +8px gap) instead of flush to the bottom edge.
// On wide screens the nav is a left rail: stay at the bottom, right of the rail.
const navVisible = useBottomNavVisible();
const wide = useWideLayout();
const positionStyle = computed(() => miniPlayerStyle({ navVisible: navVisible.value, wide: wide.value }));

const currentTrack = computed(() => audioStore.currentTrack);

const albumArtUrl = computed(() => {
  const track = currentTrack.value;
  if (!track) return '';
  return jellyfinStore.getImageUrl(track.albumId || track.id, 'Primary', 96, 96);
});

// A cover that failed to load (network cut while locked) is fetched again.
const artFailed = ref(false);
const artAttempt = ref(0);
watch(albumArtUrl, () => { artFailed.value = false; });
useRetryWhileFailed(artFailed, () => {
  artFailed.value = false;
  artAttempt.value++;
});

function expand() {
  audioStore.isExpanded = true;
}

function seekFromProgress(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement;
  const ratio = e.offsetX / bar.offsetWidth;
  audioStore.seek(ratio * audioStore.duration);
}
</script>
