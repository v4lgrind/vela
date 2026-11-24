import { defineStore } from 'pinia';

import type { Library } from '@/domain';

import { useSessionStore } from './session-store';

const LEGACY_STORE_KEY = 'jellyfin';

/** Libraries remembered by the old store, so the offline library list survives the update. */
function legacyLibraries(): unknown[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORE_KEY);
    const libraries = raw ? (JSON.parse(raw) as { libraries?: unknown[] }).libraries : undefined;
    return Array.isArray(libraries) ? libraries : [];
  } catch {
    return [];
  }
}

/**
 * The signed-in account's libraries, remembered per account so the library
 * list and offline pages work without the server.
 */
export const useLibrariesStore = defineStore('libraries', {
  state: () => ({ byAccount: {} as Record<string, Library[]>, legacyImported: false }),
  persist: true,
  getters: {
    libraries(state): Library[] {
      const key = useSessionStore().activeKey;
      return key ? state.byAccount[key] ?? [] : [];
    },
  },
  actions: {
    async refresh(): Promise<Library[]> {
      const session = useSessionStore();
      if (!session.backend || !session.activeKey) return this.libraries;
      const libraries = await session.backend.catalog.libraries();
      this.byAccount = { ...this.byAccount, [session.activeKey]: libraries };
      return libraries;
    },

    /** One-time: the old store kept the active Jellyfin account's libraries. */
    importLegacy() {
      if (this.legacyImported) return;
      const session = useSessionStore();
      const key = session.activeKey;
      if (key && session.active?.kind === 'jellyfin' && !this.byAccount[key]) {
        const libraries = legacyLibraries().map(session.decodeStoredLibrary).filter((library) => library.id);
        if (libraries.length) this.byAccount = { ...this.byAccount, [key]: libraries };
      }
      this.legacyImported = true;
    },
  },
});
