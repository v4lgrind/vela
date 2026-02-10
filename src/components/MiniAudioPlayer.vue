<template>
  <div class="mini-player" @click="expand">
    <div class="mini-progress" @click.stop="seekFromProgress">
      <div class="mini-progress-fill" :style="{ width: audioStore.progress + '%' }"></div>
    </div>
    <div class="mini-content">
      <img v-if="albumArtUrl" :src="albumArtUrl" class="mini-art" alt="Cover" />
      <div v-else class="mini-art mini-art-placeholder"></div>
      <div class="mini-info">
        <div class="mini-title">{{ currentTrack?.name || '' }}</div>
        <div class="mini-artist">{{ currentTrack?.artist || '' }}</div>
      </div>
      <div class="mini-controls" @click.stop>
        <button class="mini-btn" @click="audioStore.previous()">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/></svg>
        </button>
        <button class="mini-btn play-btn" @click="audioStore.togglePlayPause()">
          <svg v-if="!audioStore.isPlaying" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
        </button>
        <button class="mini-btn" @click="audioStore.next()">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2V6z"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAudioPlayerStore } from '../store/audio-player-store';
import { useJellyfinStore } from '../store/jellyfin-store';

const audioStore = useAudioPlayerStore();
const jellyfinStore = useJellyfinStore();

const currentTrack = computed(() => audioStore.currentTrack);

const albumArtUrl = computed(() => {
  const track = currentTrack.value;
  if (!track) return '';
  return jellyfinStore.getImageUrl(track.albumId || track.id, 'Primary', 96, 96);
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

<style scoped>
.mini-player {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: rgba(26, 26, 26, 0.95);
  backdrop-filter: blur(10px);
  z-index: 90;
  cursor: pointer;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  display: flex;
  flex-direction: column;
}

.mini-progress {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  flex-shrink: 0;
}

.mini-progress-fill {
  height: 100%;
  background: #00a4dc;
  transition: width 0.3s linear;
}

.mini-content {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 12px;
}

.mini-art {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.mini-art-placeholder {
  background: #2a2a2a;
}

.mini-info {
  flex: 1;
  min-width: 0;
}

.mini-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #f0f0f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-artist {
  font-size: 0.8rem;
  color: #9aa0a6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.mini-btn {
  background: none;
  border: none;
  color: #e0e0e0;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.mini-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.mini-btn svg {
  width: 24px;
  height: 24px;
}

.mini-btn.play-btn svg {
  width: 28px;
  height: 28px;
}
</style>
