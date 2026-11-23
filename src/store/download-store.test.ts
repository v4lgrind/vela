import type { Movie, Track } from '@/domain';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { downloadService } from '@/services/downloadService';
import { offlineDatabase } from '@/services/offlineDatabase';

import { useDownloadStore, withForcedVideoParams } from './download-store';

vi.mock('@/services/downloadService', () => ({
  downloadService: {
    downloadForOffline: vi.fn(() => new Promise(() => {})),
    isDownloading: vi.fn(() => false),
  },
}));
vi.mock('./jellyfin-store', () => ({
  useJellyfinStore: () => ({
    serverUrl: 'https://jf.example', accessToken: 'token', libraries: [],
    fetchItemDetails: async (id: string) => ({ Id: id }),
  }),
}));
vi.mock('./session-store', () => ({
  useSessionStore: () => ({ backend: { catalog: { libraryOf: async () => 'music' } } }),
}));
vi.mock('@/services/offlineDatabase', async (importActual) => ({
  ...(await importActual<typeof import('@/services/offlineDatabase')>()),
  offlineDatabase: { getAllDownloads: vi.fn(async () => []), patchDownload: vi.fn(async () => true) },
}));

const user = { played: false, playCount: 0, favorite: false };
const base = (id: string, title: string) => ({ id, title, genres: [], studios: [], images: {}, user });
const track = (id: string, title: string, extra: Partial<Track> = {}): Track =>
  ({ ...base(id, title), kind: 'track', artists: [], albumArtists: [], versions: [], ...extra });
const movie = (id: string, title: string): Movie => ({ ...base(id, title), kind: 'movie', versions: [], credits: [] });

describe('withForcedVideoParams', () => {
  it('adds video bitrate and resolution box params', () => {
    const out = withForcedVideoParams('https://jf.example/Videos/abc/stream.ts', 8_000_000, 720);
    const params = new URL(out).searchParams;
    expect(params.get('videoBitRate')).toBe('8000000');
    expect(params.get('maxHeight')).toBe('720');
    expect(params.get('maxWidth')).toBe('1280');
  });

  it('replaces an existing bitrate baked in by Jellyfin (case-insensitive)', () => {
    const out = withForcedVideoParams(
      'https://jf.example/Videos/abc/stream.ts?VideoBitrate=25000000&MaxHeight=2160',
      8_000_000,
      720,
    );
    const params = new URL(out).searchParams;
    // No leftover duplicate under the original casing.
    expect(params.get('VideoBitrate')).toBeNull();
    expect(params.get('MaxHeight')).toBeNull();
    expect(params.get('videoBitRate')).toBe('8000000');
    expect(params.get('maxHeight')).toBe('720');
  });

  it('omits resolution params when height is 0 (bitrate-only cap)', () => {
    const out = withForcedVideoParams('https://jf.example/Videos/abc/stream.ts', 3_000_000, 0);
    const params = new URL(out).searchParams;
    expect(params.get('videoBitRate')).toBe('3000000');
    expect(params.has('maxHeight')).toBe(false);
    expect(params.has('maxWidth')).toBe(false);
  });

  it('uses an explicit width for non-16:9 display bounds', () => {
    const out = withForcedVideoParams('https://jf.example/Videos/abc/stream.ts', 20_000_000, 1080, 2424);
    const params = new URL(out).searchParams;
    expect(params.get('maxHeight')).toBe('1080');
    expect(params.get('maxWidth')).toBe('2424');
  });

  it('returns the original string when the URL cannot be parsed', () => {
    expect(withForcedVideoParams('not a url', 8_000_000, 720)).toBe('not a url');
  });
});

describe('download queue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('starts each queued download once, at most 3 at a time', async () => {
    const store = useDownloadStore();
    for (const id of ['a', 'b', 'c', 'd', 'e']) store.startDownload(id, track(id, id));
    await new Promise((resolve) => setTimeout(resolve));

    const started = vi.mocked(downloadService.downloadForOffline).mock.calls.map((call) => call[1]);
    expect(started).toEqual(['a', 'b', 'c']);
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
    await new Promise((resolve) => setTimeout(resolve));
    expect(store.getTask('t1')).toMatchObject({ status: 'failed', groupId: 'al1', groupName: 'Plague' });

    await store.retry('t1');
    await new Promise((resolve) => setTimeout(resolve));

    expect(vi.mocked(downloadService.downloadForOffline).mock.calls.map((call) => call[1])).toEqual(['t1', 't1']);
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
    await new Promise((resolve) => setTimeout(resolve));
    expect(store.getTask('m1')?.status).toBe('failed');

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
