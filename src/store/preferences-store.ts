import { defineStore } from 'pinia';

export const usePreferencesStore = defineStore('preferences', {
  state: () => ({
    preferredAudioLanguage: '' as string, // ISO 639-2/B code, e.g. 'eng', 'fra'. Empty = use track default.
    preferredSubtitleLanguage: '' as string, // ISO 639-2/B or empty = off
    libraryOrder: [] as string[], // ordered library IDs; empty = server default order
  }),
  persist: true,
});
