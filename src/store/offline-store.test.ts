import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { syncService } from '@/services/syncService';

import { useOfflineStore } from './offline-store';

/** In-memory stand-in for the IndexedDB `downloads` store, with the same semantics. */
const rows = new Map<string, any>();
const copy = (value: any) => JSON.parse(JSON.stringify(value));

vi.mock('@/services/offlineDatabase', async (importActual) => ({
  ...(await importActual<typeof import('@/services/offlineDatabase')>()),
  offlineDatabase: {
    init: async () => {},
    getAllDownloads: async () => [...rows.values()].map(copy),
    addDownload: async (record: any) => { rows.set(record.itemId, copy(record)); },
    deleteDownload: async (itemId: string) => { rows.delete(itemId); },
    patchDownload: async (itemId: string, patch: any) => {
      const row = rows.get(itemId);
      if (!row) return false;
      rows.set(itemId, { ...row, ...copy(patch) });
      return true;
    },
  },
}));
vi.mock('@/services/offlineDetection', () => ({ offlineDetection: { isFullyOnline: true, isOnline: { value: true } } }));
vi.mock('@/services/syncService', () => ({ syncService: { syncWatchProgress: vi.fn(async () => ({ synced: 0, failed: 0, kept: 0 })) } }));
vi.mock('@/services/downloadService', () => ({ downloadService: { cacheArtworkById: vi.fn(), cacheArtworkForMetadata: vi.fn() } }));
const libraryOf = vi.fn();
vi.mock('./session-store', () => ({ useSessionStore: () => ({ backend: { catalog: { libraryOf } } }) }));
vi.mock('./libraries-store', () => ({ useLibrariesStore: () => ({ libraries: [] }) }));
vi.mock('./jellyfin-store', () => {
  const store = { serverUrl: 'https://jf', accessToken: 'token', userId: 'u', libraries: [], fetchLibraryIdOf: vi.fn(), fetchItemsByIds: vi.fn(async () => []) };
  return { useJellyfinStore: () => store };
});

const track = (itemId: string) => ({ itemId, type: 'Audio', name: itemId, filePath: `content://${itemId}`, fileSize: 1, downloadDate: 0, jellyfinItem: { Id: itemId } });

beforeEach(() => {
  setActivePinia(createPinia());
  rows.clear();
  vi.clearAllMocks();
});

describe('offline store background work', () => {
  it('does not bring back a download deleted during a backfill', async () => {
    rows.set('a', track('a'));
    const store = useOfflineStore();
    store.initialized = true;
    await store.loadDownloads();
    let answer!: (id: string) => void;
    libraryOf.mockReturnValue(new Promise((resolve) => { answer = resolve; }));

    const backfill = store.backfillLibraryIds();
    await store.removeDownload('a');
    answer('music');
    await backfill;

    expect(rows.has('a')).toBe(false);
  });

  it('runs one library backfill at a time', async () => {
    rows.set('a', track('a'));
    const store = useOfflineStore();
    store.initialized = true;
    await store.loadDownloads();
    libraryOf.mockResolvedValue('music');

    await Promise.all([store.backfillLibraryIds(), store.backfillLibraryIds()]);

    expect(libraryOf).toHaveBeenCalledTimes(1);
    expect(rows.get('a').libraryId).toBe('music');
  });

  it('pushes offline progress when the app starts online', async () => {
    const store = useOfflineStore();
    await store.init();
    await vi.waitFor(() => expect(syncService.syncWatchProgress).toHaveBeenCalled());
  });
});
