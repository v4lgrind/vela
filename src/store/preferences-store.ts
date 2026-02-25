import { defineStore } from 'pinia';

export const usePreferencesStore = defineStore('preferences', {
  state: () => ({
    preferredAudioLanguage: '' as string, // ISO 639-2/B code, e.g. 'eng', 'fra'. Empty = use track default.
    preferredSubtitleLanguage: '' as string, // ISO 639-2/B or empty = off
    libraryOrder: [] as string[], // ordered library IDs; empty = server default order
    preferredBitrate: 0 as number, // 0 = Auto; otherwise max bitrate in bps (e.g. 8_000_000 for 720p)
    colorScheme: 'dark' as 'dark' | 'light' | 'system',
  }),
  persist: true,
});
