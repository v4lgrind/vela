<template>
  <div class="expanded-player">
    <div class="expanded-header">
      <button class="collapse-btn" @click="audioStore.isExpanded = false">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
      </button>
      <span class="expanded-label">En cours de lecture</span>
      <button class="queue-toggle-btn" @click="showQueue = !showQueue">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
      </button>
    </div>

    <div v-if="!showQueue" class="expanded-main">
      <img v-if="albumArtUrl" :src="albumArtUrl" class="expanded-art" alt="Cover" />
      <div v-else class="expanded-art expanded-art-placeholder"></div>

      <div class="expanded-info">
        <div class="expanded-title">{{ currentTrack?.name || '' }}</div>
        <div class="expanded-artist">{{ currentTrack?.artist || '' }}</div>
        <div v-if="currentTrack?.albumName" class="expanded-album">{{ currentTrack.albumName }}</div>
      </div>

      <div class="progress-section">
        <div class="progress-bar-container" @click="seekFromProgress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: audioStore.progress + '%' }"></div>
          </div>
        </div>
        <div class="time-labels">
          <span>{{ formatTime(audioStore.currentTime) }}</span>
          <span>{{ formatTime(audioStore.duration) }}</span>
        </div>
      </div>

      <div class="expanded-controls">
        <button class="ctrl-btn" :disabled="!audioStore.hasPrevious && audioStore.currentTime <= 3" @click="audioStore.previous()">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/></svg>
        </button>
        <button class="ctrl-btn play-main" @click="audioStore.togglePlayPause()">
          <svg v-if="!audioStore.isPlaying" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
        </button>
        <button class="ctrl-btn" :disabled="!audioStore.hasNext" @click="audioStore.next()">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2V6z"/></svg>
        </button>
      </div>

      <div class="volume-section">
        <svg class="vol-icon" viewBox="0 0 24 24" fill="currentColor">
          <path v-if="audioStore.volume > 50" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
          <path v-else-if="audioStore.volume > 0" d="M7 9v6h4l5 5V4l-5 5H7z"/>
          <path v-else d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
        </svg>
        <input type="range" min="0" max="100" :value="audioStore.volume" @input="onVolumeChange" class="volume-slider" />
      </div>
    </div>

    <div v-else class="queue-section">
      <h3 class="queue-title">File d'attente</h3>
      <div class="queue-list">
        <div
          v-for="(track, i) in audioStore.queue"
          :key="track.id"
          class="queue-item"
          :class="{ active: i === audioStore.currentIndex }"
          @click="jumpToTrack(i)"
        >
          <div class="queue-num">{{ track.indexNumber || i + 1 }}</div>
          <div class="queue-info">
            <div class="queue-track-name">{{ track.name }}</div>
            <div class="queue-track-artist">{{ track.artist }}</div>
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

function onVolumeChange(e: Event) {
  audioStore.setVolume(Number((e.target as HTMLInputElement).value));
}

function jumpToTrack(index: number) {
  audioStore.currentIndex = index;
  audioStore.isPlaying = true;
}
</script>

<style scoped>
.expanded-player {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: radial-gradient(circle at top, #1a1a2e 0%, #0a0a0a 70%);
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: env(safe-area-inset-top, 12px) 16px calc(16px + env(safe-area-inset-bottom, 0px));
}

.expanded-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  flex-shrink: 0;
}

.collapse-btn,
.queue-toggle-btn {
  background: none;
  border: none;
  color: #e0e0e0;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-btn svg,
.queue-toggle-btn svg {
  width: 28px;
  height: 28px;
}

.collapse-btn:hover,
.queue-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.expanded-label {
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9aa0a6;
}

.expanded-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 16px 0;
}

.expanded-art {
  width: 280px;
  height: 280px;
  border-radius: 12px;
  object-fit: cover;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.expanded-art-placeholder {
  background: #2a2a2a;
}

.expanded-info {
  text-align: center;
  max-width: 100%;
}

.expanded-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.expanded-artist {
  font-size: 1rem;
  color: #aaa;
  margin-top: 4px;
}

.expanded-album {
  font-size: 0.85rem;
  color: #777;
  margin-top: 2px;
}

.progress-section {
  width: 100%;
  max-width: 400px;
}

.progress-bar-container {
  width: 100%;
  height: 24px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  position: relative;
}

.progress-bar-container:hover .progress-bar {
  height: 6px;
}

.progress-fill {
  height: 100%;
  background: #00a4dc;
  border-radius: 2px;
  transition: width 0.3s linear;
}

.time-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #9aa0a6;
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
}

.expanded-controls {
  display: flex;
  align-items: center;
  gap: 24px;
}

.ctrl-btn {
  background: none;
  border: none;
  color: #e0e0e0;
  cursor: pointer;
  padding: 12px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.ctrl-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.ctrl-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.ctrl-btn svg {
  width: 32px;
  height: 32px;
}

.ctrl-btn.play-main {
  background: #fff;
  color: #000;
  padding: 16px;
}

.ctrl-btn.play-main:hover {
  background: #e0e0e0;
}

.ctrl-btn.play-main svg {
  width: 36px;
  height: 36px;
}

.volume-section {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 300px;
}

.vol-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  color: #9aa0a6;
}

.volume-slider {
  flex: 1;
  height: 4px;
  appearance: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

/* Queue */
.queue-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.queue-title {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0 0 12px 0;
}

.queue-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.queue-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.queue-item.active {
  background: rgba(0, 164, 220, 0.15);
}

.queue-item.active .queue-track-name {
  color: #00a4dc;
}

.queue-num {
  width: 28px;
  text-align: center;
  color: #9aa0a6;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.queue-info {
  flex: 1;
  min-width: 0;
}

.queue-track-name {
  font-weight: 600;
  color: #f0f0f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-track-artist {
  font-size: 0.8rem;
  color: #9aa0a6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
