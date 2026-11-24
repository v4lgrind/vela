import { defineStore } from 'pinia';

import type { Episode, Library, MediaItem } from '@/domain';

export interface HomeSnapshot {
  /** Account the snapshot belongs to (session `activeKey`). */
  accountKey: string;
  libraries: Library[];
  resumeItems: MediaItem[];
  upNext: Episode[];
  latestByLibrary: Record<string, MediaItem[]>;
  /** Playback may have changed resume/next-up data; refetch behind the snapshot. */
  isStale?: boolean;
}

/** Last home screen, shown instantly when coming back to it (memory only). */
export const useHomeStore = defineStore('home', {
  state: () => ({ snapshot: null as HomeSnapshot | null }),
  actions: {
    markStale() {
      if (this.snapshot) this.snapshot = { ...this.snapshot, isStale: true };
    },
  },
});
