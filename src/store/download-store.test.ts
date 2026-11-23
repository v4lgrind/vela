import type { Movie, Track } from '@/domain';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { downloadService } from '@/services/downloadService';
import { offlineDatabase } from '@/services/offlineDatabase';

import { useDownloadStore } from './download-store';

vi.mock('@/services/downloadService', () => ({
  artworkResolverFor: () => () => ({ url: '', headers: {} }),
  buildOfflineArtworkTargets: () => [],
  downloadService: {
    downloadForOffline: vi.fn(() => new Promise(() => {})),
    isDownloading: vi.fn(() => false),
  },
}));
const backend = {
  catalog: { libraryOf: async () => 'music', item: async () => { throw new Error('offline detail'); } },
  downloads: { plan: async () => ({ url: 'u', headers: {}, fileExtension: 'mkv', isTranscoded: false, sidecars: [], markers: [] }) },
  imageUrl: () => '',
  authHeaders: () => ({}),
};
vi.mock('./session-store', () => ({ useSessionStore: () => ({ backend, active: { serverId: 'srv' } }) }));
vi.mock('@/services/offlineDatabase', async (importActual) => ({
  ...(await importActual<typeof import('@/services/offlineDatabase')>()),
  offlineDatabase: { getAllDownloads: vi.fn(async () => []), patchDownload: vi.fn(async () => true) },
}));

const user = { played: false, playCount: 0, favorite: false };
const base = (id: string, title: string) => ({ id, title, genres: [], studios: [], images: {}, user });
const track = (id: string, title: string, extra: Partial<Track> = {}): Track =>
  ({ ...base(id, title), kind: 'track', artists: [], albumArtists: [], versions: [], ...extra });
const movie = (id: string, title: string): Movie => ({ ...base(id, title), kind: 'movie', versions: [], credits: [] });

describe('download queue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('starts each queued download once, at most 3 at a time', async () => {
    const store = useDownloadStore();
    for (const id of ['a', 'b', 'c', 'd', 'e']) store.startDownload(id, track(id, id));
    const started = () => vi.mocked(downloadService.downloadForOffline).mock.calls.map((call) => call[0].id);
    await vi.waitFor(() => expect(started()).toEqual(['a', 'b', 'c']));
    expect(store.activeDownloads.map((task) => task.status)).toEqual(['downloading', 'downloading', 'downloading', 'queued', 'queued']);
  });
});

describe('download retry', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(downloadService.downloadForOffline).mockClear();
  });

  it('retries a failed download from its metadata', async () => {
    vi.mocked(downloadService.downloadForOffline).mockRejectedValueOnce(new Error('HTTP 500'));
    const store = useDownloadStore();
    store.startDownload('t1', track('t1', 'Adagio', { albumId: 'al1', albumTitle: 'Plague' }));
    await vi.waitFor(() => expect(store.getTask('t1')).toMatchObject({ status: 'failed', groupId: 'al1', groupName: 'Plague' }));

    await store.retry('t1');
    await vi.waitFor(() => expect(vi.mocked(downloadService.downloadForOffline).mock.calls.map((call) => call[0].id)).toEqual(['t1', 't1']));
    expect(store.getTask('t1')?.status).toBe('downloading');
  });
});

describe('download bookkeeping', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(downloadService.downloadForOffline).mockClear();
  });

  it('retries with the transcode choices of the first attempt', async () => {
    vi.mocked(downloadService.downloadForOffline).mockRejectedValueOnce(new Error('HTTP 500'));
    const store = useDownloadStore();
    store.startDownload('m1', movie('m1', 'Dune'), { maxBitrate: 8_000_000, audioStreamId: '2' });
    await vi.waitFor(() => expect(store.getTask('m1')?.status).toBe('failed'));

    await store.retry('m1');

    expect(store._transcodeOptionsQueue.get('m1')).toEqual({ maxBitrate: 8_000_000, audioStreamId: '2' });
  });

  it('records the library of a finished download', async () => {
    vi.mocked(downloadService.downloadForOffline).mockResolvedValueOnce(undefined);
    const store = useDownloadStore();
    store.startDownload('t1', track('t1', 'Adagio'));

    await vi.waitFor(() => expect(offlineDatabase.patchDownload).toHaveBeenCalledWith('t1', { libraryId: 'music' }));
  });
});
