import { defineStore } from 'pinia';

export const usePreferencesStore = defineStore('preferences', {
  state: () => ({
    preferredAudioLanguage: '' as string, // ISO 639-2/B code, e.g. 'eng', 'fra'. Empty = use track default.
    preferredSubtitleLanguage: '' as string, // ISO 639-2/B or empty = off
    subtitleSize: 1.0 as number, // scale factor: 0.75 = small, 1.0 = normal, 1.25 = large, 1.5 = xl, 2.0 = huge
    libraryOrder: [] as string[], // ordered library IDs; empty = server default order
    preferredBitrate: 0 as number, // 0 = Auto; otherwise max bitrate in bps (e.g. 8_000_000 for 720p)
    colorScheme: 'dark' as 'dark' | 'light' | 'system',
    forceOfflineMode: false as boolean,
  }),
  persist: true,
});
