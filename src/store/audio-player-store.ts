import { defineStore } from 'pinia';

export interface AudioTrack {
  id: string;
  name: string;
  artist: string;
  albumId: string;
  albumName: string;
  duration: number;
  indexNumber: number;
}

interface AudioPlayerState {
  queue: AudioTrack[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMiniPlayerVisible: boolean;
  isExpanded: boolean;
}

export const useAudioPlayerStore = defineStore('audio-player', {
  state: (): AudioPlayerState => ({
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 100,
    isMiniPlayerVisible: false,
    isExpanded: false,
  }),
  persist: false,
  getters: {
    currentTrack: (state): AudioTrack | null => {
      if (state.currentIndex < 0 || state.currentIndex >= state.queue.length) return null;
      return state.queue[state.currentIndex];
    },
    hasNext: (state): boolean => state.currentIndex < state.queue.length - 1,
    hasPrevious: (state): boolean => state.currentIndex > 0,
    progress: (state): number => {
      if (state.duration <= 0) return 0;
      return (state.currentTime / state.duration) * 100;
    },
  },
  actions: {
    playTrack(track: AudioTrack) {
      this.queue = [track];
      this.currentIndex = 0;
      this.isMiniPlayerVisible = true;
      this.isPlaying = true;
      // audioPlayerService listens to state changes and loads the track
    },
    playAlbum(tracks: AudioTrack[], startIndex = 0) {
      this.queue = tracks;
      this.currentIndex = startIndex;
      this.isMiniPlayerVisible = true;
      this.isPlaying = true;
    },
    next() {
      if (this.hasNext) {
        this.currentIndex++;
        this.isPlaying = true;
      } else {
        this.stop();
      }
    },
    previous() {
      // If more than 3s in, restart current track
      if (this.currentTime > 3 && this.currentIndex >= 0) {
        this.currentTime = 0;
        return;
      }
      if (this.hasPrevious) {
        this.currentIndex--;
        this.isPlaying = true;
      }
    },
    togglePlayPause() {
      this.isPlaying = !this.isPlaying;
    },
    seek(seconds: number) {
      this.currentTime = seconds;
    },
    setVolume(v: number) {
      this.volume = Math.max(0, Math.min(100, v));
    },
    stop() {
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;
      this.isMiniPlayerVisible = false;
      this.isExpanded = false;
      this.queue = [];
      this.currentIndex = -1;
    },
  },
});
